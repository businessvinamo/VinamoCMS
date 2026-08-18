import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Kopfzeile } from '@/components/Kopfzeile'
import { anzeigezustand, ladeEintraege, ladeBearbeitbareInhaltstypen, ZUSTAND_TEXT } from '@/lib/content'
import { requireTenant, requireUser } from '@/lib/tenant'
import { NeuKnopf } from '@/components/NeuKnopf'
import { Reihenfolge } from '@/components/Reihenfolge'
import { sortiere } from './actions'

export const dynamic = 'force-dynamic'

export default async function ListenSeite({
  params,
}: { params: Promise<{ slug: string; type: string }> }) {
  const { slug, type } = await params
  const nutzer = await requireUser()
  const { tenant } = await requireTenant(slug)

  const typen = await ladeBearbeitbareInhaltstypen(tenant.id)
  const typ = typen.find((t) => t.key === type)
  if (!typ) redirect(`/t/${slug}`)

  const eintraege = await ladeEintraege(tenant.id, typ.id)

  // Einzelseiten haben genau einen Eintrag -- den Umweg über eine Liste mit
  // einem Element kann sich der Kunde sparen.
  if (typ.kind === 'single' && eintraege.length === 1) {
    redirect(`/t/${slug}/${type}/${eintraege[0].id}`)
  }

  const titelVon = (e: (typeof eintraege)[number]) => {
    const haupt = e.translations[tenant.default_locale]?.field_values ?? {}
    for (const f of typ.fields) {
      const w = f.translatable ? haupt[f.key] : e.field_values[f.key]
      if (typeof w === 'string' && w.trim()) return w
    }
    return 'Ohne Titel'
  }

  return (
    <main className="huelle">
      <Kopfzeile email={nutzer.email} />
      <div className="stapel">
        <div className="stapel-eng">
          <Link href={`/t/${slug}`} className="leise">← {tenant.name}</Link>
          <h1>{typ.namePlural}</h1>
          {typ.description && <p className="leise">{typ.description}</p>}
        </div>

        {eintraege.length === 0 ? (
          <div className="karte">
            <h2>Noch nichts angelegt</h2>
            <p className="leise">Leg den ersten Eintrag an, dann erscheint er hier.</p>
          </div>
        ) : (
          <ul className="liste">
            {eintraege.map((e, i) => {
              const zustand = anzeigezustand(e)
              return (
                <li key={e.id} className={typ.sortable ? 'sortierzeile' : undefined}>
                  <Link href={`/t/${slug}/${type}/${e.id}`} className="karte karte-klick">
                    <span className="stapel-eng">
                      <strong>{titelVon(e)}</strong>
                      {e.slot && <span className="leise mono">Platz: {e.slot}</span>}
                    </span>
                    <span className={`marke-rolle zustand-${zustand}`}>{ZUSTAND_TEXT[zustand]}</span>
                  </Link>
                  {typ.sortable && (
                    <Reihenfolge
                      tenantSlug={slug} typeKey={type} index={i}
                      reihenfolge={eintraege.map((x) => x.id)} sortiere={sortiere}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <NeuKnopf tenantSlug={slug} typeKey={type} beschriftung={`${typ.name} hinzufügen`} />
      </div>
    </main>
  )
}
