import Link from 'next/link'
import { Marke } from '@/components/Marke'
import { createClient } from '@/lib/supabase/server'
import { isPlatformAdmin, requireTenant, requireUser } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

const SPRACHNAMEN: Record<string, string> = {
  de: 'Deutsch', fr: 'Französisch', it: 'Italienisch', en: 'Englisch',
}

/**
 * Mandanten-Startseite.
 *
 * In Phase 1 zeigt sie, was es über den Mandanten zu wissen gibt: Sprachen,
 * Zugänge, freigeschaltete Funktionen. Ab Phase 2 steht hier die Liste der
 * Inhaltstypen, die der Kunde pflegen darf.
 */
export default async function MandantSeite({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  await requireUser()

  const { tenant, role } = await requireTenant(slug)
  const istAdmin = await isPlatformAdmin()
  const supabase = await createClient()

  const [{ data: mitglieder }, { data: schalter }] = await Promise.all([
    supabase.from('tenant_members').select('user_id, role, created_at').eq('tenant_id', tenant.id),
    supabase.from('tenant_feature_flags').select('flag_key, enabled').eq('tenant_id', tenant.id),
  ])

  const aktiv = (schalter ?? []).filter((s) => s.enabled).map((s) => s.flag_key)

  return (
    <main className="huelle">
      <Marke />
      <div className="stapel">
        <div className="stapel-eng">
          <Link href="/" className="leise">← Alle Websites</Link>
          <h1>{tenant.name}</h1>
          <p className="leise mono">{tenant.slug}</p>
        </div>

        {!tenant.is_active && (
          <div className="hinweis warn">
            Diese Website ist stillgelegt. Inhalte lassen sich ansehen, aber nicht ändern.
          </div>
        )}

        <div className="karte">
          <h2>Sprachen</h2>
          <ul className="liste">
            {tenant.locales.map((l) => (
              <li key={l} className="zeile">
                <span>{SPRACHNAMEN[l] ?? l}</span>
                {l === tenant.default_locale && (
                  <span className="marke-rolle">Hauptsprache</span>
                )}
              </li>
            ))}
          </ul>
          <p className="leise">
            Fehlt eine Übersetzung, zeigt die Website automatisch die Hauptsprache.
          </p>
        </div>

        <div className="karte">
          <h2>Zugänge</h2>
          <ul className="liste">
            {(mitglieder ?? []).map((m) => (
              <li key={m.user_id} className="zeile">
                <span className="mono leise">{m.user_id.slice(0, 8)}…</span>
                <span className="marke-rolle">
                  {m.role === 'owner' ? 'Besitzer' : 'Redaktion'}
                </span>
              </li>
            ))}
            {(mitglieder ?? []).length === 0 && (
              <li className="leise">Noch niemand freigeschaltet.</li>
            )}
          </ul>
          {role === 'owner' || istAdmin ? (
            <p className="leise">Als Besitzer kannst du weitere Personen einladen.</p>
          ) : (
            <p className="leise">Neue Zugänge vergibt der Besitzer dieser Website.</p>
          )}
        </div>

        <div className="karte">
          <h2>Freigeschaltet</h2>
          {aktiv.length === 0 ? (
            <p className="leise">
              Für diese Website ist noch keine Funktion freigeschaltet.
            </p>
          ) : (
            <ul className="liste">
              {aktiv.map((k) => (
                <li key={k} className="mono leise">{k}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="karte">
          <h2>Inhalte pflegen</h2>
          <p className="leise">
            Kommt in Phase 2. Dann stehen hier die Inhaltstypen dieser Website —
            und du kannst sie bearbeiten, in allen Sprachen, mit Entwurf und
            bewusster Veröffentlichung.
          </p>
        </div>
      </div>
    </main>
  )
}
