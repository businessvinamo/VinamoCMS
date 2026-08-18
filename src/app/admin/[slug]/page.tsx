import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Kopfzeile } from '@/components/Kopfzeile'
import { MandantSchalter } from '@/components/MandantSchalter'
import { createClient } from '@/lib/supabase/server'
import { isPlatformAdmin, requireUser } from '@/lib/tenant'
import { schalteFunktion, schalteInhaltstyp, setzeMandantAktiv, setzeWaehrung } from '../actions'

export const dynamic = 'force-dynamic'

/** Einen Mandanten verwalten: Inhaltstypen, Funktionen, Stilllegung. */
export default async function MandantVerwalten({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const nutzer = await requireUser()
  if (!(await isPlatformAdmin())) redirect('/')

  const supabase = await createClient()
  const { data: mandant } = await supabase
    .from('tenants').select('*').eq('slug', slug).maybeSingle()
  if (!mandant) redirect('/admin')

  const [{ data: alleTypen }, { data: aktiveTypen }, { data: flags }, { data: tenantFlags }] =
    await Promise.all([
      supabase.from('content_types')
        .select('id, key, name_plural, description, supports_scheduling, supports_slots').order('name_plural'),
      supabase.from('tenant_content_types').select('content_type_id').eq('tenant_id', mandant.id),
      supabase.from('feature_flags').select('key, description, enabled_globally, kill_switch').order('key'),
      supabase.from('tenant_feature_flags').select('flag_key, enabled').eq('tenant_id', mandant.id),
    ])

  const aktiv = new Set((aktiveTypen ?? []).map((t) => t.content_type_id))
  const flagAn = new Map((tenantFlags ?? []).map((f) => [f.flag_key, f.enabled]))

  return (
    <main className="huelle">
      <Kopfzeile email={nutzer.email} />
      <div className="stapel">
        <div className="stapel-eng">
          <Link href="/admin" className="leise">← Mandanten</Link>
          <h1>{mandant.name}</h1>
          <p className="leise mono">
            {mandant.slug} · {mandant.locales.join(', ')} · Hauptsprache {mandant.default_locale}
          </p>
        </div>

        <div className="aktionen">
          <Link href={`/t/${mandant.slug}`} className="aktion">Inhalte ansehen</Link>
          <Link href={`/t/${mandant.slug}/benutzer`} className="aktion">Zugänge</Link>
        </div>

        <MandantSchalter
          tenantId={mandant.id}
          istAktiv={mandant.is_active}
          waehrung={mandant.currency}
          typen={(alleTypen ?? []).map((t) => ({
            id: t.id, name: t.name_plural, beschreibung: t.description,
            an: aktiv.has(t.id),
            zeitgesteuert: t.supports_scheduling, plaetze: t.supports_slots,
          }))}
          funktionen={(flags ?? []).map((f) => ({
            key: f.key, beschreibung: f.description,
            an: flagAn.get(f.key) ?? f.enabled_globally,
            notbremse: f.kill_switch,
          }))}
          schalteTyp={schalteInhaltstyp}
          schalteFunktion={schalteFunktion}
          setzeAktiv={setzeMandantAktiv}
          setzeWaehrung={setzeWaehrung}
        />
      </div>
    </main>
  )
}
