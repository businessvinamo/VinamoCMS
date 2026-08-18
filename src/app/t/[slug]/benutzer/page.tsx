import Link from 'next/link'
import { Kopfzeile } from '@/components/Kopfzeile'
import { Zugaenge } from '@/components/Zugaenge'
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

  // tenant_member_accounts() prüft selbst, dass der Aufrufer zum Mandanten
  // gehört, und gibt nur dessen Mitglieder zurück. Vorher las diese Seite ALLE
  // Auth-Konten mit dem Service-Schlüssel und filterte danach im Code.
  const { data: konten } = await supabase.rpc('tenant_member_accounts', {
    p_tenant_id: tenant.id,
  })

  type Konto = { user_id: string; email: string | null }
  const liste = ((konten ?? []) as Konto[]).map((k) => ({
    userId: k.user_id,
    email: k.email ?? 'unbekannt',
    binIchSelbst: k.user_id === ich.id,
  }))

  return (
    <main className="huelle">
      <Kopfzeile email={ich.email} />
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
