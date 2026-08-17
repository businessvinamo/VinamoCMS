import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Marke } from '@/components/Marke'
import { BenutzerListe } from '@/components/BenutzerListe'
import { createClient } from '@/lib/supabase/server'
import { isPlatformAdmin, requireUser } from '@/lib/tenant'
import { loescheBenutzer, setzeAdminrolle, setzePasswortNeu, setzeRechte } from './actions'

export const dynamic = 'force-dynamic'

/** Alle Benutzer über alle Mandanten hinweg. Nur für die Rolle admin. */
export default async function BenutzerVerwaltung() {
  const ich = await requireUser()
  if (!(await isPlatformAdmin())) redirect('/')

  // Über das Token des Benutzers: all_user_accounts() prüft selbst, dass der
  // Aufrufer Admin ist. Kein Service-Schlüssel, keine Grenze im Anwendungscode.
  const supabase = await createClient()
  const [{ data: konten }, { data: mitgliedschaften }, { data: mandanten },
         { data: typen }, { data: aktivierungen }] = await Promise.all([
    supabase.rpc('all_user_accounts'),
    supabase.from('tenant_members').select('tenant_id, user_id, can_manage_users, allowed_content_types'),
    supabase.from('tenants').select('id, slug, name').order('name'),
    supabase.from('content_types').select('id, name_plural').order('name_plural'),
    supabase.from('tenant_content_types').select('tenant_id, content_type_id'),
  ])

  const mandantVon = new Map((mandanten ?? []).map((t) => [t.id, t]))
  const typName = new Map((typen ?? []).map((t) => [t.id, t.name_plural]))

  type Konto = {
    user_id: string; email: string | null; is_platform_admin: boolean
    muss_passwort_aendern: boolean; last_sign_in_at: string | null
  }

  const benutzer = ((konten ?? []) as Konto[])
    .map((u) => ({
      id: u.user_id,
      email: u.email ?? '(ohne Adresse)',
      istAdmin: u.is_platform_admin,
      binIchSelbst: u.user_id === ich.id,
      wechselOffen: u.muss_passwort_aendern,
      zuletzt: u.last_sign_in_at,
      mitgliedschaften: (mitgliedschaften ?? [])
        .filter((m) => m.user_id === u.user_id)
        .map((m) => ({
          tenantId: m.tenant_id,
          tenantName: mandantVon.get(m.tenant_id)?.name ?? 'unbekannt',
          darfBenutzerVerwalten: m.can_manage_users,
          erlaubteTypen: m.allowed_content_types as string[] | null,
          // Nur Typen anbieten, die für diesen Mandanten überhaupt frei sind.
          verfuegbareTypen: (aktivierungen ?? [])
            .filter((a) => a.tenant_id === m.tenant_id)
            .map((a) => ({ id: a.content_type_id, name: typName.get(a.content_type_id) ?? '?' }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        })),
    }))
    .sort((a, b) => Number(b.istAdmin) - Number(a.istAdmin) || a.email.localeCompare(b.email))

  return (
    <main className="huelle">
      <Marke />
      <div className="stapel">
        <div className="stapel-eng">
          <Link href="/admin" className="leise">← Mandanten</Link>
          <h1>Benutzer</h1>
          <p className="leise">
            Alle Konten über alle Mandanten. Zugänge für einen einzelnen Kunden
            legst du bei diesem Mandanten an.
          </p>
        </div>

        <BenutzerListe
          benutzer={benutzer}
          setzeAdminrolle={setzeAdminrolle}
          setzePasswortNeu={setzePasswortNeu}
          loescheBenutzer={loescheBenutzer}
          setzeRechte={setzeRechte}
        />
      </div>
    </main>
  )
}
