import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/** Rolle innerhalb eines Mandanten. Alle Mandanten-Benutzer sind gleichberechtigt. */
export type TenantRole = 'client'

export type Tenant = {
  id: string
  slug: string
  name: string
  locales: string[]
  default_locale: string
  timezone: string
  branding: Record<string, unknown>
  is_active: boolean
  /** Währung aller Preisfelder. Gehört zum Betrieb, nicht zum Feld. */
  currency: string
}

export type Membership = {
  role: TenantRole
  tenant: Tenant
}

/**
 * Der angemeldete Benutzer, sonst weiter zur Anmeldung.
 *
 * getUser() statt getSession(): getSession liest das Cookie ungeprüft, getUser
 * lässt das Token vom Auth-Server verifizieren. Auf einen Wert, der über eine
 * Berechtigung entscheidet, gehört die geprüfte Variante.
 */
export async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return user
}

/** Hat der Benutzer die Rolle admin (mandantenübergreifend)? */
export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('is_platform_admin')
  if (error) return false
  return data === true
}

/**
 * Alle Mandanten des Benutzers.
 *
 * Die Einschränkung auf den Benutzer steht ausdrücklich in der Abfrage.
 *
 * Vorher stand hier nur RLS -- mit der Begründung, die Trennung gehöre an eine
 * Stelle. Das war eine Verwechslung: RLS beantwortet "welche Zeilen darf ich
 * sehen", nicht "welche Zeilen sind meine". Die Richtlinie auf tenant_members
 * lässt Mitglieder desselben Mandanten einander sehen -- das ist richtig und für
 * die Benutzerverwaltung nötig. Ohne user_id-Filter kam deshalb pro Mitglied
 * eine Zeile zurück, und der Mandant erschien auf der Startseite doppelt,
 * sobald ein zweiter Zugang angelegt wurde.
 */
export async function listMemberships(): Promise<Membership[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('tenant_members')
    .select('role, tenant:tenants(id, slug, name, locales, default_locale, timezone, branding, is_active, currency)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Mandanten konnten nicht geladen werden: ${error.message}`)

  return (data ?? [])
    .filter((row): row is typeof row & { tenant: Tenant } => Boolean(row.tenant))
    .map((row) => ({ role: row.role as TenantRole, tenant: row.tenant }))
}

/**
 * Der Mandant hinter /t/<slug> -- oder 404, wenn es ihn nicht gibt ODER der
 * Benutzer nicht dazugehört.
 *
 * Beides ergibt bewusst dieselbe Antwort. Ein "existiert, aber kein Zugriff"
 * würde verraten, welche Kunden Vinamo hat.
 */
export async function requireTenant(slug: string): Promise<{ tenant: Tenant; role: TenantRole | null }> {
  const supabase = await createClient()

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, slug, name, locales, default_locale, timezone, branding, is_active, currency')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(`Mandant konnte nicht geladen werden: ${error.message}`)
  if (!tenant) redirect('/?unbekannt=1')

  const { data: { user } } = await supabase.auth.getUser()

  // .eq('user_id', ...) ist hier nicht optional: Ohne den Filter liefert die
  // Abfrage bei zwei Mitgliedern zwei Zeilen, und maybeSingle() wird zum Fehler.
  const { data: membership } = user
    ? await supabase
        .from('tenant_members')
        .select('role')
        .eq('tenant_id', tenant.id)
        .eq('user_id', user.id)
        .maybeSingle()
    : { data: null }

  // Kein Eintrag heisst: ein Admin ohne eigene Mitgliedschaft in diesem
  // Mandanten. Der darf trotzdem alles -- can_manage_tenant() deckt beides ab.
  return { tenant: tenant as Tenant, role: (membership?.role as TenantRole) ?? null }
}
