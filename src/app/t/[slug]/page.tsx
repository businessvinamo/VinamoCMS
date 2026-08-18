import Link from 'next/link'
import { Kopfzeile } from '@/components/Kopfzeile'
import { createClient } from '@/lib/supabase/server'
import { isPlatformAdmin, requireTenant, requireUser } from '@/lib/tenant'
import { ladeBearbeitbareInhaltstypen } from '@/lib/content'

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
  const nutzer = await requireUser()

  const { tenant, role } = await requireTenant(slug)
  const istAdmin = await isPlatformAdmin()
  const supabase = await createClient()

  const [{ data: mitglieder }, { data: schalter }, typen] = await Promise.all([
    supabase.from('tenant_members').select('user_id, role, created_at').eq('tenant_id', tenant.id),
    supabase.from('tenant_feature_flags').select('flag_key, enabled').eq('tenant_id', tenant.id),
    ladeBearbeitbareInhaltstypen(tenant.id),
  ])

  const aktiv = (schalter ?? []).filter((s) => s.enabled).map((s) => s.flag_key)

  return (
    <main className="huelle">
      <Kopfzeile email={nutzer.email} />
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
              </li>
            ))}
            {(mitglieder ?? []).length === 0 && (
              <li className="leise">Noch niemand freigeschaltet.</li>
            )}
          </ul>
          <Link href={`/t/${tenant.slug}/benutzer`} className="aktion">Zugänge verwalten</Link>
        </div>

        <div className="karte">
          <h2>Protokoll</h2>
          <p className="leise">
            Wer wann was veröffentlicht hat — und ob die Website danach
            aktualisiert wurde.
          </p>
          <Link href={`/t/${tenant.slug}/protokoll`} className="aktion">Protokoll ansehen</Link>
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

        <div className="stapel-eng">
          <h2>Inhalte pflegen</h2>
          {typen.length === 0 ? (
            <p className="leise">
              Für diese Website ist noch kein Inhaltstyp freigeschaltet.
            </p>
          ) : (
            <ul className="liste">
              {typen.map((t) => (
                <li key={t.id}>
                  <Link href={`/t/${tenant.slug}/${t.key}`} className="karte karte-klick">
                    <span className="stapel-eng">
                      <strong>{t.namePlural}</strong>
                      {t.description && <span className="leise">{t.description}</span>}
                    </span>
                    <span aria-hidden="true" className="leise">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  )
}
