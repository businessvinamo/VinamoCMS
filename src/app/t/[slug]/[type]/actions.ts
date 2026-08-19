'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { ladeInhaltstypen } from '@/lib/content'
import { saeubereRichtextWerte } from '@/lib/richtext'
import { pruefeWerte, type FieldValues, type Fehler } from '@/lib/fields'
import { requireTenant } from '@/lib/tenant'
import { sendeWebhooks } from '@/lib/webhooks'

export type SpeicherErgebnis =
  | { ok: true; gespeichertUm: string }
  | { ok: false; fehler: Fehler[] }

type Entwurf = {
  entryId: string
  tenantSlug: string
  typeKey: string
  fieldValues: FieldValues
  translations: Record<string, { field_values: FieldValues; slug: string | null }>
  publishAt: string | null
  validFrom: string | null
  validUntil: string | null
  slot: string | null
  priority: number
}

/**
 * Entwurf speichern.
 *
 * Wird auch vom automatischen Zwischenspeichern aufgerufen, deshalb wird hier
 * NICHT auf Pflichtfelder geprüft -- sonst könnte die Wirtin einen halb
 * getippten Eintrag nicht zwischenspeichern. Die harte Prüfung sitzt am
 * Veröffentlichen, wo sie hingehört.
 *
 * Geschrieben wird mit dem Token des Benutzers, nicht mit dem Service-Schlüssel:
 * Row Level Security bleibt damit die wirksame Grenze und nicht nur Zierde.
 */
export async function speichereEntwurf(entwurf: Entwurf): Promise<SpeicherErgebnis> {
  const { tenant } = await requireTenant(entwurf.tenantSlug)
  const supabase = await createClient()

  // Richtext säubern, BEVOR er in die Datenbank geht.
  //
  // Der Inhalt geht unverändert über die Lese-API auf die Kundenwebsite und
  // landet dort in dangerouslySetInnerHTML -- anders lässt sich formatierter
  // Text nicht ausliefern. Ohne diesen Schritt könnte die Aushilfe, die nur
  // News pflegen darf, ein <script> auf der Firmenwebsite platzieren.
  const typen = await ladeInhaltstypen(tenant.id)
  const typ = typen.find((t) => t.key === entwurf.typeKey)
  const felder = typ?.fields ?? []

  const fieldValues = saeubereRichtextWerte(felder, entwurf.fieldValues)
  const translations = Object.fromEntries(
    Object.entries(entwurf.translations).map(([l, v]) => [
      l, { ...v, field_values: saeubereRichtextWerte(felder, v.field_values) },
    ]),
  )

  const { error } = await supabase
    .from('entries')
    .update({
      field_values: fieldValues,
      publish_at: entwurf.publishAt,
      valid_from: entwurf.validFrom,
      valid_until: entwurf.validUntil,
      slot: entwurf.slot,
      priority: entwurf.priority,
    })
    .eq('id', entwurf.entryId)
    .eq('tenant_id', tenant.id)

  if (error) return { ok: false, fehler: [{ pfad: '', meldung: uebersetzeFehler(error.message) }] }

  for (const [locale, inhalt] of Object.entries(translations)) {
    if (!tenant.locales.includes(locale)) continue
    const { error: tFehler } = await supabase.from('entry_translations').upsert(
      {
        entry_id: entwurf.entryId,
        locale,
        field_values: inhalt.field_values,
        slug: inhalt.slug || null,
      },
      { onConflict: 'entry_id,locale' },
    )
    if (tFehler) return { ok: false, fehler: [{ pfad: locale, meldung: uebersetzeFehler(tFehler.message) }] }
  }

  return { ok: true, gespeichertUm: new Date().toISOString() }
}

/**
 * Veröffentlichen.
 *
 * Erst hier wird vollständig geprüft, dann schreibt publish_entry einen
 * unveränderlichen Schnappschuss fort. Der Entwurf bleibt unberührt -- der Kunde
 * arbeitet weiter, ohne dass sich die Website ändert.
 */
export async function veroeffentliche(entwurf: Entwurf, notiz?: string): Promise<SpeicherErgebnis> {
  const { tenant } = await requireTenant(entwurf.tenantSlug)

  const gespeichert = await speichereEntwurf(entwurf)
  if (!gespeichert.ok) return gespeichert

  const typen = await ladeInhaltstypen(tenant.id)
  const typ = typen.find((t) => t.key === entwurf.typeKey)
  if (!typ) return { ok: false, fehler: [{ pfad: '', meldung: 'Unbekannter Inhaltstyp.' }] }

  const uebersetzungen = Object.fromEntries(
    Object.entries(entwurf.translations).map(([l, v]) => [l, v.field_values]),
  )
  const fehler = pruefeWerte(typ.fields, entwurf.fieldValues, uebersetzungen, tenant.default_locale)
  if (fehler.length > 0) return { ok: false, fehler }

  const supabase = await createClient()
  const { error } = await supabase.rpc('publish_entry', {
    p_entry_id: entwurf.entryId,
    p_note: notiz ?? null,
  })
  if (error) return { ok: false, fehler: [{ pfad: '', meldung: uebersetzeFehler(error.message) }] }

  // Der Rebuild der Kundenseite darf das Veröffentlichen nicht aufhalten: Der
  // Eintrag ist bereits live, der Webhook wird in die Warteschlange gelegt und
  // vom Zusteller abgearbeitet -- mit Wiederholversuchen und sichtbarem Protokoll.
  await sendeWebhooks(tenant.id, 'entry.published', {
    tenant: tenant.slug,
    content_type: entwurf.typeKey,
    entry_id: entwurf.entryId,
  })

  revalidatePath(`/t/${entwurf.tenantSlug}/${entwurf.typeKey}`)
  return { ok: true, gespeichertUm: new Date().toISOString() }
}

export async function legeEintragAn(tenantSlug: string, typeKey: string): Promise<string> {
  const { tenant } = await requireTenant(tenantSlug)
  const supabase = await createClient()

  const { data: typ } = await supabase
    .from('content_types').select('id').eq('key', typeKey).single()
  if (!typ) throw new Error('Unbekannter Inhaltstyp.')

  const { data: letzte } = await supabase
    .from('entries').select('position')
    .eq('tenant_id', tenant.id).eq('content_type_id', typ.id)
    .order('position', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await supabase
    .from('entries')
    .insert({
      tenant_id: tenant.id,
      content_type_id: typ.id,
      status: 'draft',
      position: (letzte?.position ?? -1) + 1,
      field_values: {},
    })
    .select('id')
    .single()

  if (error) throw new Error(uebersetzeFehler(error.message))
  revalidatePath(`/t/${tenantSlug}/${typeKey}`)
  return data.id
}

export async function stelleLetzteVersionWiederHer(
  tenantSlug: string, typeKey: string, entryId: string,
): Promise<SpeicherErgebnis> {
  const supabase = await createClient()

  const { data: version } = await supabase
    .from('entry_versions').select('id')
    .eq('entry_id', entryId).order('version_no', { ascending: false })
    .limit(1).maybeSingle()

  if (!version) {
    return { ok: false, fehler: [{ pfad: '', meldung: 'Es gibt noch keine veröffentlichte Version.' }] }
  }

  const { error } = await supabase.rpc('restore_entry_version', { p_version_id: version.id })
  if (error) return { ok: false, fehler: [{ pfad: '', meldung: uebersetzeFehler(error.message) }] }

  revalidatePath(`/t/${tenantSlug}/${typeKey}/${entryId}`)
  return { ok: true, gespeichertUm: new Date().toISOString() }
}

/** Sortierung nach Drag & Drop. Eine Anweisung pro Eintrag, in einer Transaktion. */
export async function sortiere(
  tenantSlug: string, typeKey: string, reihenfolge: string[],
): Promise<void> {
  const { tenant } = await requireTenant(tenantSlug)
  const supabase = await createClient()

  await Promise.all(
    reihenfolge.map((id, i) =>
      supabase.from('entries').update({ position: i }).eq('id', id).eq('tenant_id', tenant.id),
    ),
  )
  revalidatePath(`/t/${tenantSlug}/${typeKey}`)
}

/**
 * Datenbankfehler in Klartext.
 *
 * Der Kunde soll lesen, was zu tun ist -- nicht einen Postgres-Constraint-Namen.
 */
function uebersetzeFehler(meldung: string): string {
  if (meldung.includes('entries_valid_range')) {
    return 'Das Enddatum muss nach dem Startdatum liegen.'
  }
  if (meldung.includes('entry_slugs_unique_current')) {
    return 'Diese Web-Adresse wird bereits von einem anderen Eintrag verwendet.'
  }
  if (meldung.includes('entry_translations_slug_format')) {
    return 'Die Web-Adresse darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.'
  }
  if (meldung.includes('Einzelseite')) {
    return 'Von dieser Seite kann es nur einen Eintrag geben.'
  }
  if (meldung.includes('42501') || meldung.toLowerCase().includes('policy')) {
    return 'Dafür fehlt dir die Berechtigung.'
  }
  console.error('[content] unbehandelter Datenbankfehler', meldung)
  return 'Das hat nicht geklappt. Bitte nochmals versuchen.'
}

/**
 * Eintrag löschen.
 *
 * Endgültig, inklusive Übersetzungen und Versionshistorie (Cascade). Für den
 * Fall "soll nur von der Website verschwinden" gibt es archiviere() -- das ist
 * fast immer gemeint und umkehrbar.
 */
export async function loescheEintrag(
  tenantSlug: string, typeKey: string, entryId: string,
): Promise<SpeicherErgebnis> {
  const { tenant } = await requireTenant(tenantSlug)
  const supabase = await createClient()

  const { error } = await supabase.from('entries').delete()
    .eq('id', entryId).eq('tenant_id', tenant.id)

  if (error) return { ok: false, fehler: [{ pfad: '', meldung: uebersetzeFehler(error.message) }] }

  await supabase.rpc('log_audit', {
    p_tenant_id: tenant.id, p_action: 'entry.deleted',
    p_target_type: 'entry', p_target_id: entryId, p_meta: { content_type: typeKey },
  })
  await sendeWebhooks(tenant.id, 'entry.published', {
    tenant: tenant.slug, content_type: typeKey, entry_id: entryId, grund: 'geloescht',
  })

  revalidatePath(`/t/${tenantSlug}/${typeKey}`)
  return { ok: true, gespeichertUm: new Date().toISOString() }
}

/**
 * Von der Website nehmen oder zurückholen.
 *
 * Archiviert bleibt der Eintrag samt Historie erhalten und lässt sich jederzeit
 * wieder veröffentlichen -- der Normalfall für "das soll gerade nicht mehr
 * sichtbar sein".
 */
export async function archiviere(
  tenantSlug: string, typeKey: string, entryId: string, archivieren: boolean,
): Promise<SpeicherErgebnis> {
  const { tenant } = await requireTenant(tenantSlug)
  const supabase = await createClient()

  const { error } = await supabase.from('entries')
    .update({ status: archivieren ? 'archived' : 'draft' })
    .eq('id', entryId).eq('tenant_id', tenant.id)

  if (error) return { ok: false, fehler: [{ pfad: '', meldung: uebersetzeFehler(error.message) }] }

  await supabase.rpc('log_audit', {
    p_tenant_id: tenant.id,
    p_action: archivieren ? 'entry.archived' : 'entry.unarchived',
    p_target_type: 'entry', p_target_id: entryId, p_meta: {},
  })
  await sendeWebhooks(tenant.id, 'entry.published', {
    tenant: tenant.slug, content_type: typeKey, entry_id: entryId,
    grund: archivieren ? 'archiviert' : 'zurueckgeholt',
  })

  revalidatePath(`/t/${tenantSlug}/${typeKey}`)
  return { ok: true, gespeichertUm: new Date().toISOString() }
}
