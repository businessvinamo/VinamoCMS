'use client'

import { useState, useTransition } from 'react'
import type { AdminBenutzerErgebnis } from '@/app/admin/benutzer/actions'
import type { Mitgliedschaft } from '@/components/BenutzerListe'

/**
 * Rechte einer Mitgliedschaft.
 *
 * Bewusst keine Rollennamen, sondern Haken auf das, was jemand tatsächlich tun
 * darf. Ein Rollenname wie "Redaktion" beantwortet die Frage "darf sie an die
 * Preise" nämlich nicht -- man muss trotzdem nachschlagen, was die Rolle umfasst.
 */
export function Rechte({
  mitgliedschaft: m, userId, gesperrt, speichern, nachSpeichern,
}: {
  mitgliedschaft: Mitgliedschaft
  userId: string
  gesperrt?: boolean
  speichern: (
    tenantId: string, userId: string, darfVerwalten: boolean, typen: string[] | null,
  ) => Promise<AdminBenutzerErgebnis>
  nachSpeichern: (e: AdminBenutzerErgebnis) => void
}) {
  const [verwaltet, setVerwaltet] = useState(m.darfBenutzerVerwalten)
  const [alle, setAlle] = useState(m.erlaubteTypen === null)
  const [typen, setTypen] = useState<string[]>(m.erlaubteTypen ?? [])
  const [laeuft, starte] = useTransition()

  const geaendert =
    verwaltet !== m.darfBenutzerVerwalten ||
    alle !== (m.erlaubteTypen === null) ||
    (!alle && JSON.stringify([...typen].sort()) !== JSON.stringify([...(m.erlaubteTypen ?? [])].sort()))

  return (
    <details className="rechte">
      <summary>
        <span className="umbruch">{m.tenantName}</span>
        <span className="leise">
          {m.darfBenutzerVerwalten ? 'verwaltet Zugänge' : 'nur Inhalte'}
          {m.erlaubteTypen !== null && ` · ${m.erlaubteTypen.length} Bereiche`}
        </span>
      </summary>

      <div className="stapel-eng" style={{ marginTop: 12 }}>
        <label className="haken">
          <input type="checkbox" checked={verwaltet} disabled={gesperrt}
                 onChange={(e) => setVerwaltet(e.target.checked)} />
          <span>
            <strong>Darf Zugänge verwalten</strong>
            <span className="leise">Personen hinzufügen, entfernen, Passwörter zurücksetzen</span>
          </span>
        </label>

        <label className="haken">
          <input type="checkbox" checked={alle} disabled={gesperrt}
                 onChange={(e) => setAlle(e.target.checked)} />
          <span>
            <strong>Darf alle Bereiche bearbeiten</strong>
            <span className="leise">
              Auch solche, die später dazukommen. Sonst unten einzeln wählen.
            </span>
          </span>
        </label>

        {!alle && (
          <div className="chips" style={{ marginTop: 4 }}>
            {m.verfuegbareTypen.map((t) => {
              const an = typen.includes(t.id)
              return (
                <button key={t.id} type="button" disabled={gesperrt}
                        aria-pressed={an} className={an ? 'chip chip-an' : 'chip'}
                        onClick={() => setTypen(an ? typen.filter((x) => x !== t.id) : [...typen, t.id])}>
                  {t.name}
                </button>
              )
            })}
            {m.verfuegbareTypen.length === 0 && (
              <span className="leise">Für diesen Mandanten ist kein Inhaltstyp freigeschaltet.</span>
            )}
          </div>
        )}

        {geaendert && (
          <button type="button" disabled={laeuft || gesperrt}
                  onClick={() => starte(async () => {
                    nachSpeichern(await speichern(m.tenantId, userId, verwaltet, alle ? null : typen))
                  })}>
            {laeuft ? 'Wird gespeichert …' : 'Rechte speichern'}
          </button>
        )}
      </div>
    </details>
  )
}
