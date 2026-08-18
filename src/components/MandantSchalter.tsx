'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

type Typ = { id: string; name: string; beschreibung: string; an: boolean; zeitgesteuert: boolean; plaetze: boolean }
type Funktion = { key: string; beschreibung: string; an: boolean; notbremse: boolean }

export function MandantSchalter({
  tenantId, istAktiv, waehrung, typen, funktionen,
  schalteTyp, schalteFunktion, setzeAktiv, setzeWaehrung,
}: {
  tenantId: string
  istAktiv: boolean
  waehrung: string
  typen: Typ[]
  funktionen: Funktion[]
  schalteTyp: (tenantId: string, contentTypeId: string, an: boolean) => Promise<void>
  schalteFunktion: (tenantId: string, flagKey: string, an: boolean) => Promise<void>
  setzeAktiv: (tenantId: string, aktiv: boolean) => Promise<void>
  setzeWaehrung: (tenantId: string, waehrung: string) => Promise<void>
}) {
  const router = useRouter()
  const [laeuft, starte] = useTransition()
  const tun = (fn: () => Promise<void>) => starte(async () => { await fn(); router.refresh() })

  return (
    <>
      <div className="karte">
        <h2>Währung</h2>
        <p className="leise">
          Gilt für alle Preisfelder dieses Kunden — Speisekarte wie Leistungen.
        </p>
        <div className="chips">
          {['CHF', 'EUR'].map((w) => (
            <button key={w} type="button" disabled={laeuft}
                    aria-pressed={waehrung === w}
                    className={waehrung === w ? 'chip chip-an' : 'chip'}
                    onClick={() => tun(() => setzeWaehrung(tenantId, w))}>
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="karte">
        <h2>Inhaltstypen</h2>
        <p className="leise">
          Was dieser Kunde pflegen darf. Abschalten löscht nichts — die Einträge
          bleiben und tauchen wieder auf, wenn du den Typ erneut freigibst.
        </p>
        <ul className="liste">
          {typen.map((t) => (
            <li key={t.id} className="zeile">
              <span className="stapel-eng">
                <strong>{t.name}</strong>
                <span className="leise">{t.beschreibung}</span>
                <span className="leise">
                  {t.zeitgesteuert ? 'mit Zeitsteuerung' : 'ohne Zeitsteuerung'}
                  {t.plaetze && ' · mit Plätzen'}
                </span>
              </span>
              <button type="button" disabled={laeuft}
                      className={t.an ? 'chip chip-an' : 'chip'}
                      aria-pressed={t.an}
                      onClick={() => tun(() => schalteTyp(tenantId, t.id, !t.an))}>
                {t.an ? 'Frei' : 'Aus'}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="karte">
        <h2>Funktionen</h2>
        <p className="leise">
          Jede neue Funktion lässt sich pro Kunde einzeln freischalten — und im
          Fehlerfall sofort wieder abschalten, ohne Deploy.
        </p>
        <ul className="liste">
          {funktionen.map((f) => (
            <li key={f.key} className="zeile">
              <span className="stapel-eng">
                <strong className="mono">{f.key}</strong>
                <span className="leise">{f.beschreibung}</span>
                {f.notbremse && (
                  <span className="leise" style={{ color: 'var(--warn)' }}>
                    Notbremse global gezogen — bleibt überall aus
                  </span>
                )}
              </span>
              <button type="button" disabled={laeuft || f.notbremse}
                      className={f.an && !f.notbremse ? 'chip chip-an' : 'chip'}
                      aria-pressed={f.an && !f.notbremse}
                      onClick={() => tun(() => schalteFunktion(tenantId, f.key, !f.an))}>
                {f.an && !f.notbremse ? 'An' : 'Aus'}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="karte">
        <h2>{istAktiv ? 'Stilllegen' : 'Wieder aktivieren'}</h2>
        <p className="leise">
          {istAktiv
            ? 'Ein stillgelegter Mandant liefert keine Inhalte mehr über die Lese-API — die Kundenwebsite bleibt beim letzten Stand stehen. Nichts wird gelöscht.'
            : 'Der Mandant liefert danach wieder Inhalte aus.'}
        </p>
        <button type="button" disabled={laeuft}
                className={istAktiv ? 'knopf-zweit' : undefined}
                onClick={() => {
                  if (istAktiv && !confirm('Mandant wirklich stilllegen? Die Lese-API liefert danach nichts mehr.')) return
                  tun(() => setzeAktiv(tenantId, !istAktiv))
                }}>
          {istAktiv ? 'Mandant stilllegen' : 'Mandant aktivieren'}
        </button>
      </div>
    </>
  )
}
