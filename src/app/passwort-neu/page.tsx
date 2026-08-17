'use client'

import { use, useActionState } from 'react'
import { Marke } from '@/components/Marke'
import { MIN_LAENGE } from '@/lib/passwort'
import { setzeNeuesPasswort, type PasswortErgebnis } from './actions'

const START: PasswortErgebnis = { status: 'idle' }

export default function PasswortNeuSeite({
  searchParams,
}: {
  searchParams: Promise<{ erstmalig?: string }>
}) {
  const { erstmalig } = use(searchParams)
  const [ergebnis, absenden, laeuft] = useActionState(setzeNeuesPasswort, START)

  return (
    <main className="huelle huelle-schmal">
      <Marke />
      <div className="stapel">
        <h1>{erstmalig ? 'Passwort festlegen' : 'Neues Passwort'}</h1>

        {erstmalig ? (
          <p className="leise">
            Du hast dich mit dem Startpasswort angemeldet. Wähle jetzt dein eigenes.
          </p>
        ) : (
          <p className="leise">Wähle dein neues Passwort.</p>
        )}

        <form action={absenden} className="stapel">
          {/* Für Passwortverwaltungen: sagt ihnen, zu welchem Konto das gehört. */}
          <input type="text" name="username" autoComplete="username"
                 style={{ display: 'none' }} readOnly value="" />

          <div className="stapel-eng">
            <label htmlFor="passwort">Neues Passwort</label>
            <p className="leise">
              Mindestens {MIN_LAENGE} Zeichen. Ein kurzer Satz ist leichter zu merken
              und sicherer als ein kompliziertes kurzes Wort.
            </p>
            <input id="passwort" name="passwort" type="password"
                   autoComplete="new-password" required minLength={MIN_LAENGE} />
          </div>

          <div className="stapel-eng">
            <label htmlFor="wiederholung">Nochmals eingeben</label>
            <input id="wiederholung" name="wiederholung" type="password"
                   autoComplete="new-password" required minLength={MIN_LAENGE} />
          </div>

          {ergebnis.status === 'fehler' && (
            <div className="hinweis warn" role="alert">{ergebnis.meldung}</div>
          )}

          <button type="submit" disabled={laeuft}>
            {laeuft ? 'Wird gespeichert …' : 'Passwort speichern'}
          </button>
        </form>
      </div>
    </main>
  )
}
