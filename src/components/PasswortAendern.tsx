'use client'

import { useActionState } from 'react'
import { MIN_LAENGE } from '@/lib/passwort'
import type { PasswortAendernErgebnis } from '@/app/einstellungen/actions'

const START: PasswortAendernErgebnis = { status: 'idle' }

export function PasswortAendern({
  aendern,
}: {
  aendern: (
    bisher: PasswortAendernErgebnis, formular: FormData,
  ) => Promise<PasswortAendernErgebnis>
}) {
  const [ergebnis, absenden, laeuft] = useActionState(aendern, START)

  return (
    <form action={absenden} className="karte">
      <h2>Passwort ändern</h2>

      {/* Für Passwortverwaltungen: zu welchem Konto gehört das. */}
      <input type="text" name="username" autoComplete="username"
             className="visuell-versteckt" readOnly value="" tabIndex={-1} />

      <div className="stapel-eng">
        <label htmlFor="aktuell">Aktuelles Passwort</label>
        <input id="aktuell" name="aktuell" type="password"
               autoComplete="current-password" required />
      </div>

      <div className="stapel-eng">
        <label htmlFor="neu">Neues Passwort</label>
        <p className="leise">
          Mindestens {MIN_LAENGE} Zeichen. Ein kurzer Satz ist leichter zu merken
          und sicherer als ein kompliziertes kurzes Wort.
        </p>
        <input id="neu" name="neu" type="password"
               autoComplete="new-password" required minLength={MIN_LAENGE} />
      </div>

      <div className="stapel-eng">
        <label htmlFor="wiederholung">Neues Passwort nochmals</label>
        <input id="wiederholung" name="wiederholung" type="password"
               autoComplete="new-password" required minLength={MIN_LAENGE} />
      </div>

      {ergebnis.status === 'fehler' && (
        <div className="hinweis warn" role="alert">{ergebnis.meldung}</div>
      )}
      {ergebnis.status === 'ok' && (
        <div className="hinweis gut" role="status">{ergebnis.meldung}</div>
      )}

      <button type="submit" disabled={laeuft}>
        {laeuft ? 'Wird gespeichert …' : 'Passwort ändern'}
      </button>
    </form>
  )
}
