'use client'

import { useState, useTransition } from 'react'
import type { ZugangErgebnis } from '@/app/t/[slug]/benutzer/actions'

type Eintrag = { userId: string; email: string; binIchSelbst: boolean }

export function Zugaenge({
  tenantSlug, liste, anlegen, zuruecksetzen, entfernen,
}: {
  tenantSlug: string
  liste: Eintrag[]
  anlegen: (tenantSlug: string, formular: FormData) => Promise<ZugangErgebnis>
  zuruecksetzen: (tenantSlug: string, userId: string) => Promise<ZugangErgebnis>
  entfernen: (tenantSlug: string, userId: string) => Promise<void>
}) {
  const [ergebnis, setErgebnis] = useState<ZugangErgebnis | null>(null)
  const [laeuft, starte] = useTransition()

  return (
    <div className="stapel">
      {/*
        Das Startpasswort erscheint genau einmal und wird nirgends gespeichert.
        Es steht deshalb bewusst gross und kopierbar da -- wer es hier verpasst,
        muss es zurücksetzen.
      */}
      {ergebnis?.ok && ergebnis.startpasswort && (
        <div className="karte" style={{ borderColor: 'var(--violett)' }}>
          <h2>Zugang eingerichtet</h2>
          <p className="leise">
            Gib diese beiden Angaben an {ergebnis.email} weiter. Das Passwort wird
            nicht gespeichert und lässt sich später nicht mehr anzeigen — nur neu
            setzen. Beim ersten Anmelden muss ein eigenes Passwort gewählt werden.
          </p>
          <div className="zugangsdaten">
            <span className="leise">Adresse</span>
            <code>{ergebnis.email}</code>
            <span className="leise">Startpasswort</span>
            <code className="startpasswort">{ergebnis.startpasswort}</code>
          </div>
          <button type="button" className="knopf-zweit"
                  onClick={() => navigator.clipboard?.writeText(
                    `Anmeldung: https://admin.vinamo.ch\nE-Mail: ${ergebnis.email}\nStartpasswort: ${ergebnis.startpasswort}`,
                  )}>
            Zugangsdaten kopieren
          </button>
        </div>
      )}

      {ergebnis?.ok && !ergebnis.startpasswort && (
        <div className="hinweis gut" role="status">
          {ergebnis.email} hatte bereits ein Konto und wurde dieser Website
          hinzugefügt. Das bestehende Passwort gilt weiter.
        </div>
      )}

      {ergebnis && !ergebnis.ok && (
        <div className="hinweis warn" role="alert">{ergebnis.meldung}</div>
      )}

      <ul className="liste">
        {liste.map((e) => (
          <li key={e.userId} className="karte">
            <div className="zeile">
              <span className="stapel-eng">
                <strong>{e.email}</strong>
                {e.binIchSelbst && <span className="leise">Das bist du</span>}
              </span>
            </div>
            {!e.binIchSelbst && (
              <div className="zeile" style={{ gap: 8, justifyContent: 'flex-start' }}>
                <button type="button" className="knopf-zweit" disabled={laeuft}
                        onClick={() => starte(async () => {
                          setErgebnis(await zuruecksetzen(tenantSlug, e.userId))
                        })}>
                  Neues Startpasswort
                </button>
                <button type="button" className="knopf-klein knopf-weg" disabled={laeuft}
                        onClick={() => starte(async () => {
                          if (!confirm(`Zugang von ${e.email} wirklich entfernen?`)) return
                          await entfernen(tenantSlug, e.userId)
                          setErgebnis(null)
                        })}>
                  Entfernen
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <form
        className="karte"
        action={(formular) => starte(async () => {
          setErgebnis(await anlegen(tenantSlug, formular))
        })}
      >
        <h2>Zugang hinzufügen</h2>
        <p className="leise">
          Wir legen das Konto an und zeigen dir einmalig ein Startpasswort, das du
          weitergibst. Niemand kann sich selbst registrieren.
        </p>
        <div className="stapel-eng">
          <label htmlFor="neue-email">E-Mail-Adresse</label>
          <input id="neue-email" name="email" type="email" inputMode="email"
                 required placeholder="name@beispiel.ch" />
        </div>
        <button type="submit" disabled={laeuft}>
          {laeuft ? 'Wird angelegt …' : 'Zugang anlegen'}
        </button>
      </form>
    </div>
  )
}
