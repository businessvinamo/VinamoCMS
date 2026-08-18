'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/tenant'

export type MandantErgebnis = { ok: true; slug: string } | { ok: false; meldung: string }

const SPRACHEN = ['de', 'fr', 'it', 'en'] as const

/**
 * Neuen Mandanten anlegen und ein Branchen-Set anwenden.
 *
 * Die Berechtigung erzwingt Row Level Security: Auf tenants darf nur schreiben,
 * wer Plattformadministrator ist. Die Prüfung hier ist nur dafür da, dem
 * Aufrufer einen verständlichen Satz statt eines Datenbankfehlers zu zeigen.
 */
export async function legeMandantAn(formular: FormData): Promise<MandantErgebnis> {
  if (!(await isPlatformAdmin())) {
    return { ok: false, meldung: 'Nur Vinamo kann Mandanten anlegen.' }
  }

  const name = String(formular.get('name') ?? '').trim()
  const slug = String(formular.get('slug') ?? '').trim().toLowerCase()
  const blueprint = String(formular.get('blueprint') ?? '')
  const hauptsprache = String(formular.get('default_locale') ?? 'de')
  const sprachen = SPRACHEN.filter((l) => formular.get(`sprache_${l}`) === 'on')

  if (!name) return { ok: false, meldung: 'Bitte einen Namen eingeben.' }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false, meldung: 'Die Kennung darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.' }
  }
  if (!sprachen.includes(hauptsprache as (typeof SPRACHEN)[number])) {
    return { ok: false, meldung: 'Die Hauptsprache muss auch aktiviert sein.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tenants')
    .insert({ slug, name, locales: sprachen, default_locale: hauptsprache })
    .select('id, slug')
    .single()

  if (error) {
    if (error.message.includes('tenants_slug_key')) {
      return { ok: false, meldung: `Die Kennung „${slug}" ist schon vergeben.` }
    }
    if (error.message.includes('slug_not_reserved')) {
      return { ok: false, meldung: `„${slug}" ist reserviert. Bitte eine andere Kennung wählen.` }
    }
    console.error('[admin] Mandant anlegen', error.message)
    return { ok: false, meldung: 'Der Mandant konnte nicht angelegt werden.' }
  }

  if (blueprint) {
    const { error: bFehler } = await supabase.rpc('apply_blueprint', {
      p_tenant_id: data.id, p_blueprint_key: blueprint,
    })
    // Der Mandant steht bereits. Ein fehlgeschlagenes Baukasten-Set ist ärgerlich,
    // aber nachholbar -- deshalb kein Abbruch, sondern ein Hinweis.
    if (bFehler) {
      console.error('[admin] Baukasten anwenden', bFehler.message)
      return { ok: false, meldung: `Mandant „${name}" angelegt, aber die Inhaltstypen fehlen noch.` }
    }
  }

  revalidatePath('/admin')
  return { ok: true, slug: data.slug }
}

export async function schalteInhaltstyp(
  tenantId: string, contentTypeId: string, an: boolean,
): Promise<void> {
  const supabase = await createClient()

  if (an) {
    await supabase.from('tenant_content_types').insert({ tenant_id: tenantId, content_type_id: contentTypeId })
  } else {
    // Einträge bleiben bestehen. Ein Typ wird abgeschaltet, weil der Kunde ihn
    // nicht mehr braucht -- nicht, weil seine Inhalte weg sollen. Wird er wieder
    // eingeschaltet, ist alles noch da.
    await supabase.from('tenant_content_types').delete()
      .eq('tenant_id', tenantId).eq('content_type_id', contentTypeId)
  }
  revalidatePath('/admin')
}

export async function schalteFunktion(
  tenantId: string, flagKey: string, an: boolean,
): Promise<void> {
  const supabase = await createClient()
  await supabase.from('tenant_feature_flags')
    .upsert({ tenant_id: tenantId, flag_key: flagKey, enabled: an }, { onConflict: 'tenant_id,flag_key' })
  revalidatePath('/admin')
}

export async function setzeMandantAktiv(tenantId: string, aktiv: boolean): Promise<void> {
  const supabase = await createClient()
  await supabase.from('tenants').update({ is_active: aktiv }).eq('id', tenantId)
  revalidatePath('/admin')
}

/**
 * Währung des Mandanten umstellen.
 *
 * Sie hing vorher als config.currency an jedem einzelnen Preisfeld -- also
 * global für alle Kunden gleich. Ein Betrieb in Konstanz hätte seine Preise in
 * Franken ausgezeichnet.
 */
export async function setzeWaehrung(tenantId: string, waehrung: string): Promise<void> {
  if (waehrung !== 'CHF' && waehrung !== 'EUR') return
  const supabase = await createClient()
  await supabase.from('tenants').update({ currency: waehrung }).eq('id', tenantId)
  revalidatePath('/admin')
}
