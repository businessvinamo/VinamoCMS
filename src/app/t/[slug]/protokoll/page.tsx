import Link from 'next/link'
import { Marke } from '@/components/Marke'
import { createClient } from '@/lib/supabase/server'
import { requireTenant, requireUser } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

const AKTION_TEXT: Record<string, string> = {
  'entry.published': 'veröffentlicht',
  'entry.restored': 'auf eine frühere Version zurückgesetzt',
  'tenant.exported': 'Daten exportiert',
  'tenant.blueprint_applied': 'Inhaltstypen freigeschaltet',
}

const zeit = new Intl.DateTimeFormat('de-CH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Zurich',
})

/** Änderungsprotokoll und Zustellprotokoll der Website-Aktualisierungen. */
export default async function ProtokollSeite({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await requireUser()
  const { tenant, role } = await requireTenant(slug)
  const supabase = await createClient()

  const [{ data: protokoll }, { data: zustellungen }] = await Promise.all([
    supabase.from('audit_log')
      .select('id, actor_email, action, created_at, meta')
      .eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(50),
    supabase.from('webhook_deliveries')
      .select('id, event, attempt, status_code, error, created_at, delivered_at')
      .eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(20),
  ])

  const offen = (zustellungen ?? []).filter((z) => !z.delivered_at && z.error)

  return (
    <main className="huelle">
      <Marke />
      <div className="stapel">
        <div className="stapel-eng">
          <Link href={`/t/${slug}`} className="leise">← {tenant.name}</Link>
          <h1>Protokoll</h1>
        </div>

        {offen.length > 0 && (
          <div className="hinweis warn">
            <strong>Die Website wurde nicht aktualisiert.</strong>
            <p>
              {offen.length === 1 ? 'Eine Aktualisierung ist' : `${offen.length} Aktualisierungen sind`}{' '}
              fehlgeschlagen. Vinamo ist informiert; die Wiederholung läuft automatisch.
            </p>
          </div>
        )}

        <div className="karte">
          <h2>Wer hat was veröffentlicht</h2>
          {(protokoll ?? []).length === 0 ? (
            <p className="leise">Noch nichts veröffentlicht.</p>
          ) : (
            <ul className="liste">
              {(protokoll ?? []).map((p) => (
                <li key={p.id} className="zeile">
                  <span className="stapel-eng">
                    <span>{p.actor_email ?? 'System'}</span>
                    <span className="leise">{AKTION_TEXT[p.action] ?? p.action}</span>
                  </span>
                  <span className="leise mono">{zeit.format(new Date(p.created_at))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="karte">
          <h2>Website-Aktualisierungen</h2>
          {(zustellungen ?? []).length === 0 ? (
            <p className="leise">
              Für diese Website ist noch keine automatische Aktualisierung eingerichtet.
            </p>
          ) : (
            <ul className="liste">
              {(zustellungen ?? []).map((z) => (
                <li key={z.id} className="zeile">
                  <span className="stapel-eng">
                    <span>{z.delivered_at ? 'Erfolgreich' : z.error ? 'Fehlgeschlagen' : 'Wartet'}</span>
                    {z.error && <span className="leise">{z.error} · Versuch {z.attempt}</span>}
                  </span>
                  <span className="leise mono">{zeit.format(new Date(z.created_at))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {role === 'owner' && (
          <div className="karte">
            <h2>Deine Daten</h2>
            <p className="leise">
              Alle Inhalte, Übersetzungen und Bilder dieser Website als eine Datei —
              samt der Beschreibung, wie sie aufgebaut sind.
            </p>
            <a href={`/api/export/${slug}`} className="knopf-link">Daten herunterladen</a>
          </div>
        )}
      </div>
    </main>
  )
}
