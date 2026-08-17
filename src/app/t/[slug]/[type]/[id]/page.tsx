import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Editor } from '@/components/Editor'
import { Marke } from '@/components/Marke'
import { anzeigezustand, ladeEintrag, ladeInhaltstypen } from '@/lib/content'
import { requireTenant, requireUser } from '@/lib/tenant'
import { speichereEntwurf, veroeffentliche } from '../actions'

export const dynamic = 'force-dynamic'

export default async function EditorSeite({
  params,
}: { params: Promise<{ slug: string; type: string; id: string }> }) {
  const { slug, type, id } = await params
  await requireUser()
  const { tenant } = await requireTenant(slug)

  const typen = await ladeInhaltstypen(tenant.id)
  const typ = typen.find((t) => t.key === type)
  if (!typ) redirect(`/t/${slug}`)

  const eintrag = await ladeEintrag(id)
  if (!eintrag) redirect(`/t/${slug}/${type}`)

  const zustand = anzeigezustand(eintrag)

  return (
    <main className="huelle">
      <Marke />
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
      </div>
    </main>
  )
}
