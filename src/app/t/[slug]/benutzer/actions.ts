'use server'

import { revalidatePath } from 'next/cache'
import { erzeugeStartpasswort } from '@/lib/benutzer'
import { adminClientOderNull } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireTenant } from '@/lib/tenant'

export type ZugangErgebnis =
  | { ok: true; email: string; startpasswort: string }
  | { ok: false; meldung: string }

/** Fehlender Service-Schlüssel ist ein Betriebsproblem, kein Bedienfehler. */
const KONFIGURATION_FEHLT =
  'Zugänge lassen sich gerade nicht verwalten — dem Server fehlt eine Einstellung. Bitte bei Vinamo melden.'

/**
 * Zugang anlegen.
 *
 * Es gibt bewusst KEINE Selbstregistrierung. Konten entstehen ausschliesslich
 * hier -- angelegt von Vinamo oder vom Besitzer des Mandanten. Damit kann sich
 * niemand von aussen ein Konto verschaffen, und es gibt keine offene
 * Registrierungsseite, über die sich herausfinden liesse, welche Adressen bei
 * Vinamo Kunde sind.
 *
 * Das Startpasswort wird genau einmal angezeigt und nirgends gespeichert. Beim
 * ersten Anmelden muss es geändert werden (Merker in app_metadata, den der
 * Benutzer selbst nicht löschen kann).
 */
export async function legeZugangAn(
  tenantSlug: string,
  formular: FormData,
): Promise<ZugangErgebnis> {
  const email = String(formular.get('email') ?? '').trim().toLowerCase()

  if (!email.includes('@') || email.length < 5) {
    return { ok: false, meldung: 'Bitte eine gültige E-Mail-Adresse eingeben.' }
  }

  const { tenant } = await requireTenant(tenantSlug)
  const supabase = await createClient()

  // Berechtigung mit dem Token des Aufrufers prüfen, bevor der Service-Schlüssel
  // ins Spiel kommt. Andernfalls wäre diese Aktion ein Weg, in fremden Mandanten
  // Konten anzulegen.
  const { data: darf } = await supabase.rpc('can_manage_tenant', { p_tenant_id: tenant.id })
  if (darf !== true) {
    return { ok: false, meldung: 'Du kannst für diese Website keine Zugänge anlegen.' }
  }

  const admin = adminClientOderNull()
  if (!admin) return { ok: false, meldung: KONFIGURATION_FEHLT }
  const startpasswort = erzeugeStartpasswort()

  // Gibt es die Adresse schon? Dann kein neues Konto, nur Zugang zu diesem
  // Mandanten ergänzen -- ein Treuhänder betreut mehrere Kunden mit einem Konto.
  const { data: vorhandene } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const bestehend = vorhandene?.users.find((u) => u.email?.toLowerCase() === email)

  let userId: string

  if (bestehend) {
    userId = bestehend.id
    const { data: schonMitglied } = await admin
      .from('tenant_members')
      .select('user_id').eq('tenant_id', tenant.id).eq('user_id', userId).maybeSingle()

    if (schonMitglied) {
      return { ok: false, meldung: 'Diese Person hat bereits Zugang zu dieser Website.' }
    }
  } else {
    const { data: neu, error } = await admin.auth.admin.createUser({
      email,
      password: startpasswort,
      email_confirm: true,
      // app_metadata kann nur der Service-Schlüssel setzen. Läge der Merker in
      // user_metadata, könnte der Benutzer ihn selbst löschen und die
      // Passwortänderung überspringen.
      app_metadata: { muss_passwort_aendern: true },
    })
    if (error || !neu?.user) {
      console.error('[zugang] createUser fehlgeschlagen', error?.message)
      return { ok: false, meldung: 'Das Konto konnte nicht angelegt werden.' }
    }
    userId = neu.user.id
  }

  const { error: mFehler } = await admin
    .from('tenant_members')
    .insert({ tenant_id: tenant.id, user_id: userId, role: 'client' })

  if (mFehler) {
    console.error('[zugang] Mitgliedschaft fehlgeschlagen', mFehler.message)
    return { ok: false, meldung: 'Der Zugang konnte nicht eingerichtet werden.' }
  }

  await supabase.rpc('log_audit', {
    p_tenant_id: tenant.id,
    p_action: 'member.created',
    p_target_type: 'user',
    p_target_id: userId,
    p_meta: { email, neues_konto: !bestehend },
  })

  revalidatePath(`/t/${tenantSlug}/benutzer`)

  return {
    ok: true,
    email,
    // Bei einem bestehenden Konto gilt das alte Passwort weiter -- ein neues zu
    // setzen würde die Anmeldung bei den anderen Mandanten dieser Person brechen.
    startpasswort: bestehend ? '' : startpasswort,
  }
}

/** Startpasswort neu setzen, wenn der Kunde es verlegt hat. */
export async function setzeStartpasswortNeu(
  tenantSlug: string,
  userId: string,
): Promise<ZugangErgebnis> {
  const { tenant } = await requireTenant(tenantSlug)
  const supabase = await createClient()

  const { data: darf } = await supabase.rpc('can_manage_tenant', { p_tenant_id: tenant.id })
  if (darf !== true) {
    return { ok: false, meldung: 'Du kannst für diese Website kein Passwort zurücksetzen.' }
  }

  const admin = adminClientOderNull()
  if (!admin) return { ok: false, meldung: KONFIGURATION_FEHLT }

  // Gehört die Person überhaupt zu diesem Mandanten? Ohne diese Prüfung liesse
  // sich mit einer fremden Benutzerkennung das Passwort beliebiger Konten
  // zurücksetzen -- der Service-Schlüssel fragt RLS nicht.
  const { data: mitglied } = await admin
    .from('tenant_members')
    .select('user_id').eq('tenant_id', tenant.id).eq('user_id', userId).maybeSingle()

  if (!mitglied) {
    return { ok: false, meldung: 'Diese Person gehört nicht zu dieser Website.' }
  }

  const startpasswort = erzeugeStartpasswort()
  const { data: benutzer, error } = await admin.auth.admin.updateUserById(userId, {
    password: startpasswort,
    app_metadata: { muss_passwort_aendern: true },
  })

  if (error || !benutzer?.user) {
    console.error('[zugang] Passwort zurücksetzen fehlgeschlagen', error?.message)
    return { ok: false, meldung: 'Das Passwort konnte nicht zurückgesetzt werden.' }
  }

  await supabase.rpc('log_audit', {
    p_tenant_id: tenant.id, p_action: 'member.password_reset',
    p_target_type: 'user', p_target_id: userId, p_meta: {},
  })

  revalidatePath(`/t/${tenantSlug}/benutzer`)
  return { ok: true, email: benutzer.user.email ?? '', startpasswort }
}

export async function entferneZugang(
  tenantSlug: string, userId: string,
): Promise<ZugangErgebnis> {
  const { tenant } = await requireTenant(tenantSlug)
  const supabase = await createClient()

  // Über das Token des Aufrufers, damit RLS greift -- und mit Rückmeldung.
  // Vorher gab diese Aktion void zurück: Wem das Recht fehlte, für den passierte
  // beim Klick auf „Entfernen" sichtbar gar nichts. Row Level Security hielt
  // stand, aber ein stiller Nicht-Effekt ist die schlechteste Antwort auf eine
  // fehlende Berechtigung.
  const { data: geloescht, error } = await supabase.from('tenant_members').delete()
    .eq('tenant_id', tenant.id).eq('user_id', userId)
    .select('user_id')

  if (error) {
    console.error('[zugang] entfernen', error.message)
    return { ok: false, meldung: 'Der Zugang konnte nicht entfernt werden.' }
  }
  if (!geloescht?.length) {
    return { ok: false, meldung: 'Dafür fehlt dir die Berechtigung.' }
  }

  await supabase.rpc('log_audit', {
    p_tenant_id: tenant.id, p_action: 'member.removed',
    p_target_type: 'user', p_target_id: userId, p_meta: {},
  })

  revalidatePath(`/t/${tenantSlug}/benutzer`)
  return { ok: true, email: '', startpasswort: '' }
}
