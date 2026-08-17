import Link from 'next/link'
import { Marke } from '@/components/Marke'
import { Zugaenge } from '@/components/Zugaenge'
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireTenant, requireUser } from '@/lib/tenant'
import { entferneZugang, legeZugangAn, setzeStartpasswortNeu } from './actions'

export const dynamic = 'force-dynamic'

export default async function BenutzerSeite({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ich = await requireUser()
  const { tenant } = await requireTenant(slug)
  const supabase = await createClient()

  const { data: mitglieder } = await supabase
    .from('tenant_members')
    .select('user_id, created_at')
    .eq('tenant_id', tenant.id)
    .order('created_at')

  // E-Mail-Adressen stehen in auth.users und sind über RLS nicht erreichbar.
  // Deshalb hier der Service-Schlüssel -- erst NACH der Prüfung oben, dass der
  // Aufrufer zu diesem Mandanten gehört, und beschränkt auf dessen Mitglieder.
  const admin = adminClient()
  const { data: alle } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const adressen = new Map((alle?.users ?? []).map((u) => [u.id, u.email ?? '']))

  const liste = (mitglieder ?? []).map((m) => ({
    userId: m.user_id,
    email: adressen.get(m.user_id) ?? 'unbekannt',
    binIchSelbst: m.user_id === ich.id,
  }))

  return (
    <main className="huelle">
      <Marke />
      <div className="stapel">
        <div className="stapel-eng">
          <Link href={`/t/${slug}`} className="leise">← {tenant.name}</Link>
          <h1>Zugänge</h1>
          <p className="leise">
            Wer sich für {tenant.name} anmelden und Inhalte pflegen darf. Alle
            Zugänge sind gleichberechtigt.
          </p>
        </div>

        <Zugaenge
          tenantSlug={slug}
          liste={liste}
          anlegen={legeZugangAn}
          zuruecksetzen={setzeStartpasswortNeu}
          entfernen={entferneZugang}
        />
      </div>
    </main>
  )
}
