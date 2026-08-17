import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Beweis der Mandantentrennung.
 *
 * Der Test arbeitet nicht mit Mocks, sondern mit zwei echten Benutzern und zwei
 * echten Mandanten gegen eine echte Datenbank. Alles andere würde belegen, dass
 * unsere Attrappe funktioniert, nicht dass Row Level Security funktioniert.
 *
 * Der wichtigste Teil ist "Tabellenaufstellung": Er liest zur Laufzeit aus dem
 * Systemkatalog, welche Tabellen eine tenant_id tragen, und prüft jede einzeln.
 * Eine neue Tabelle ohne Richtlinie macht die Suite rot, ohne dass jemand daran
 * denken muss, hier einen Fall nachzutragen. Genau daran scheitern solche Tests
 * sonst: Tabelle vierzehn wird vergessen.
 *
 * Voraussetzung: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY.
 */

const URL = process.env.SUPABASE_URL
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

const KENNWORT = 'Isolationstest!' + Math.random().toString(36).slice(2)
const A_MAIL = `isolation-a-${Date.now()}@vinamo-test.invalid`
const B_MAIL = `isolation-b-${Date.now()}@vinamo-test.invalid`

let admin: SupabaseClient
let alsA: SupabaseClient
let alsB: SupabaseClient
let tenantA: string
let tenantB: string
let userA: string
let userB: string

async function anmelden(email: string): Promise<SupabaseClient> {
  const c = createClient(URL!, PUBLISHABLE!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await c.auth.signInWithPassword({ email, password: KENNWORT })
  if (error) throw new Error(`Anmeldung ${email} fehlgeschlagen: ${error.message}`)
  return c
}

beforeAll(async () => {
  if (!URL || !PUBLISHABLE || !SERVICE) {
    throw new Error(
      'Der Isolationstest braucht SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY und ' +
        'SUPABASE_SERVICE_ROLE_KEY. Siehe .env.example.',
    )
  }

  admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

  // Zwei Mandanten
  const { data: mandanten, error: mFehler } = await admin
    .from('tenants')
    .insert([
      { slug: `iso-a-${Date.now()}`, name: 'Isolation A' },
      { slug: `iso-b-${Date.now()}`, name: 'Isolation B' },
    ])
    .select('id, name')
  if (mFehler) throw mFehler
  tenantA = mandanten!.find((t) => t.name === 'Isolation A')!.id
  tenantB = mandanten!.find((t) => t.name === 'Isolation B')!.id

  // Zwei Benutzer, je einer pro Mandant
  const a = await admin.auth.admin.createUser({
    email: A_MAIL, password: KENNWORT, email_confirm: true,
  })
  const b = await admin.auth.admin.createUser({
    email: B_MAIL, password: KENNWORT, email_confirm: true,
  })
  if (a.error) throw a.error
  if (b.error) throw b.error
  userA = a.data.user!.id
  userB = b.data.user!.id

  const { error: memberFehler } = await admin.from('tenant_members').insert([
    { tenant_id: tenantA, user_id: userA, role: 'client' },
    { tenant_id: tenantB, user_id: userB, role: 'client' },
  ])
  if (memberFehler) throw memberFehler

  alsA = await anmelden(A_MAIL)
  alsB = await anmelden(B_MAIL)
})

afterAll(async () => {
  if (!admin) return
  await admin.auth.admin.deleteUser(userA).catch(() => {})
  await admin.auth.admin.deleteUser(userB).catch(() => {})
  await admin.from('tenants').delete().in('id', [tenantA, tenantB])
})

describe('Mandantentrennung', () => {
  it('jede Tabelle mit tenant_id hat RLS und mindestens eine Richtlinie', async () => {
    const { data, error } = await admin.rpc('tables_missing_tenant_isolation')
    expect(error).toBeNull()
    // Aussagekräftige Fehlermeldung: welche Tabelle fehlt, nicht nur "erwartet 0".
    expect(data, `Tabellen ohne Mandantentrennung: ${JSON.stringify(data)}`).toEqual([])
  })

  it('A sieht ausschliesslich den eigenen Mandanten', async () => {
    const { data } = await alsA.from('tenants').select('id')
    expect(data?.map((t) => t.id)).toEqual([tenantA])
  })

  it('B sieht ausschliesslich den eigenen Mandanten', async () => {
    const { data } = await alsB.from('tenants').select('id')
    expect(data?.map((t) => t.id)).toEqual([tenantB])
  })

  it('A findet den Mandanten von B auch bei gezielter Abfrage nicht', async () => {
    const { data } = await alsA.from('tenants').select('id').eq('id', tenantB)
    expect(data).toEqual([])
  })

  it('A sieht die Mitgliedschaften von B nicht', async () => {
    const { data } = await alsA.from('tenant_members').select('user_id').eq('tenant_id', tenantB)
    expect(data).toEqual([])
  })

  it('A kann sich nicht in den Mandanten von B eintragen', async () => {
    const { error } = await alsA
      .from('tenant_members')
      .insert({ tenant_id: tenantB, user_id: userA, role: 'client' })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('A kann den Mandanten von B nicht umbenennen', async () => {
    await alsA.from('tenants').update({ name: 'uebernommen' }).eq('id', tenantB)
    const { data } = await admin.from('tenants').select('name').eq('id', tenantB).single()
    expect(data!.name).toBe('Isolation B')
  })

  it('A kann den Mandanten von B nicht löschen', async () => {
    await alsA.from('tenants').delete().eq('id', tenantB)
    const { count } = await admin
      .from('tenants').select('id', { count: 'exact', head: true }).eq('id', tenantB)
    expect(count).toBe(1)
  })

  it('A kann sich keine Plattformrechte verschaffen', async () => {
    const { error } = await alsA.from('invitations').insert({
      email: 'angreifer@vinamo-test.invalid',
      tenant_id: tenantA,
      role: 'client',
      grants_platform_admin: true,
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('A ist kein Plattformadministrator', async () => {
    const { data } = await alsA.rpc('is_platform_admin')
    expect(data).toBe(false)
  })

  it('A kann das Änderungsprotokoll nicht selbst schreiben', async () => {
    const { error } = await alsA
      .from('audit_log')
      .insert({ tenant_id: tenantA, action: 'gefaelscht' })
    expect(error).not.toBeNull()
  })

  it('A sieht keine Protokolleinträge von B', async () => {
    await admin.from('audit_log').insert({ tenant_id: tenantB, action: 'test.b' })
    const { data } = await alsA.from('audit_log').select('id').eq('tenant_id', tenantB)
    expect(data).toEqual([])
  })

  it('A erfährt über Funktionsschalter von B nichts', async () => {
    const { data } = await alsA.rpc('feature_enabled', {
      p_tenant_id: tenantB,
      p_key: 'content_editor',
    })
    expect(data).toBeNull()
  })

  it('nicht angemeldet ist gar nichts sichtbar', async () => {
    const anon = createClient(URL!, PUBLISHABLE!, { auth: { persistSession: false } })
    const { data } = await anon.from('tenants').select('id')
    expect(data ?? []).toEqual([])
  })
})

describe('Grenzen der Rolle client', () => {
  it('ein client kann sich selbst keine Plattformrechte geben', async () => {
    // Der einzige Rechteunterschied, der nach der Vereinfachung auf zwei Rollen
    // noch existiert: Ein Mandanten-Benutzer darf niemals zum admin werden.
    const { error } = await alsA.from('invitations').insert({
      email: `iso-eskalation-${Date.now()}@vinamo-test.invalid`,
      tenant_id: tenantA,
      role: 'client',
      grants_platform_admin: true,
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('ein client darf Zugaenge des eigenen Mandanten verwalten', async () => {
    const { data } = await alsA.rpc('can_manage_tenant', { p_tenant_id: tenantA })
    expect(data).toBe(true)
  })

  it('ein client darf fremde Mandanten nicht verwalten', async () => {
    const { data } = await alsA.rpc('can_manage_tenant', { p_tenant_id: tenantB })
    expect(data).toBe(false)
  })

  it('ein client kann niemanden in einen fremden Mandanten eintragen', async () => {
    const mail = `iso-fremd-${Date.now()}@vinamo-test.invalid`
    const neu = await admin.auth.admin.createUser({
      email: mail, password: KENNWORT, email_confirm: true,
    })
    if (neu.error) throw neu.error

    const { error } = await alsA.from('tenant_members').insert({
      tenant_id: tenantB, user_id: neu.data.user!.id, role: 'client',
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    await admin.auth.admin.deleteUser(neu.data.user!.id)
  })
})
