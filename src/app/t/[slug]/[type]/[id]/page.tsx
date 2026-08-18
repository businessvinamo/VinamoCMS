import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Editor } from '@/components/Editor'
import { Kopfzeile } from '@/components/Kopfzeile'
import { anzeigezustand, ladeEintrag, ladeBearbeitbareInhaltstypen } from '@/lib/content'
import { requireTenant, requireUser } from '@/lib/tenant'
import { EintragAktionen } from '@/components/EintragAktionen'
import { archiviere, loescheEintrag, speichereEntwurf, stelleLetzteVersionWiederHer, veroeffentliche } from '../actions'

export const dynamic = 'force-dynamic'

export default async function EditorSeite({
  params,
}: { params: Promise<{ slug: string; type: string; id: string }> }) {
  const { slug, type, id } = await params
  const nutzer = await requireUser()
  const { tenant } = await requireTenant(slug)

  const typen = await ladeBearbeitbareInhaltstypen(tenant.id)
  const typ = typen.find((t) => t.key === type)
  if (!typ) redirect(`/t/${slug}`)

  const eintrag = await ladeEintrag(id)
  if (!eintrag) redirect(`/t/${slug}/${type}`)

  const zustand = anzeigezustand(eintrag)

  return (
    <main className="huelle">
      <Kopfzeile email={nutzer.email} />
      <div className="stapel">
        <div className="stapel-eng">
          <Link href={`/t/${slug}/${type}`} className="leise">← {typ.namePlural}</Link>
          <h1>{typ.name} bearbeiten</h1>
        </div>

        <Editor
          typ={typ}
          eintrag={eintrag}
          tenantSlug={slug}
          sprachen={tenant.locales}
          hauptsprache={tenant.default_locale}
          istLive={zustand === 'live'}
          speichern={speichereEntwurf}
          veroeffentlichen={veroeffentliche}
        />

        <EintragAktionen
          tenantSlug={slug} typeKey={type} entryId={eintrag.id}
          istArchiviert={eintrag.status === 'archived'}
          hatVersion={Boolean(eintrag.published_version_id)}
          wiederherstellen={stelleLetzteVersionWiederHer}
          archivieren={archiviere}
          loeschen={loescheEintrag}
        />
      </div>
    </main>
  )
}
