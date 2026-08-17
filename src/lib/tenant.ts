import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type TenantRole = 'owner' | 'editor'

export type Tenant = {
  id: string
  slug: string
  name: string
  locales: string[]
  default_locale: string
  timezone: string
  branding: Record<string, unknown>
  is_active: boolean
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

/** Ist der Benutzer vinamo_admin? */
export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('is_platform_admin')
  if (error) return false
  return data === true
}

/**
 * Alle Mandanten des Benutzers.
 *
 * Es steht keine Einschränkung auf den Benutzer in der Abfrage -- die macht RLS.
 * Genau das ist der Punkt: Die Trennung liegt an einer Stelle, nicht verstreut
 * in jeder Abfrage, wo sie irgendwann jemand vergisst.
 */
export async function listMemberships(): Promise<Membership[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tenant_members')
    .select('role, tenant:tenants(id, slug, name, locales, default_locale, timezone, branding, is_active)')
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
    .select('id, slug, name, locales, default_locale, timezone, branding, is_active')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(`Mandant konnte nicht geladen werden: ${error.message}`)
  if (!tenant) redirect('/?unbekannt=1')

  const { data: membership } = await supabase
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', tenant.id)
    .maybeSingle()

  // Kein Eintrag heisst: vinamo_admin ohne eigene Mitgliedschaft. Der darf lesen,
  // hat aber keine Mandantenrolle -- das unterscheidet die Oberfläche später,
  // wenn es um "einladen" geht.
  return { tenant: tenant as Tenant, role: (membership?.role as TenantRole) ?? null }
}
