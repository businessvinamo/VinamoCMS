'use client'

import { useActionState } from 'react'
import { Marke } from '@/components/Marke'
import { anmeldenMitLink, type LoginErgebnis } from './actions'
import { use } from 'react'

const START: LoginErgebnis = { status: 'idle' }

export default function LoginSeite({
  searchParams,
}: {
  searchParams: Promise<{ weiter?: string }>
}) {
  const { weiter } = use(searchParams)
  const [ergebnis, absenden, laeuft] = useActionState(anmeldenMitLink, START)

  return (
    <main className="huelle">
      <Marke />
      <div className="stapel">
        <h1>Anmelden</h1>
        <p className="leise">
          Wir schicken dir einen Link an deine E-Mail-Adresse. Kein Passwort nötig.
        </p>

        {ergebnis.status === 'gesendet' ? (
          <div className="hinweis gut">
            Link ist unterwegs. Schau in dein Postfach und öffne die Mail auf diesem Gerät.
          </div>
        ) : (
          <form action={absenden} className="stapel">
            <div className="stapel-eng">
              <label htmlFor="email">E-Mail-Adresse</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                placeholder="name@beispiel.ch"
              />
            </div>
            <input type="hidden" name="weiter" value={weiter ?? '/'} />
            {ergebnis.status === 'fehler' && (
              <div className="hinweis warn">{ergebnis.meldung}</div>
            )}
            <button type="submit" disabled={laeuft}>
              {laeuft ? 'Wird gesendet …' : 'Link schicken'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
