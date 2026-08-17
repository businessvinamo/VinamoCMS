'use client'

import Link from 'next/link'
import { use, useActionState } from 'react'
import { Marke } from '@/components/Marke'
import { anmelden, type LoginErgebnis } from './actions'

const START: LoginErgebnis = { status: 'idle' }

export default function LoginSeite({
  searchParams,
}: {
  searchParams: Promise<{ weiter?: string; neu?: string; zurueckgesetzt?: string }>
}) {
  const { weiter, neu, zurueckgesetzt } = use(searchParams)
  const [ergebnis, absenden, laeuft] = useActionState(anmelden, START)

  return (
    <main className="huelle huelle-schmal">
      <Marke />
      <div className="stapel">
        <h1>Anmelden</h1>

        {neu && (
          <div className="hinweis gut" role="status">
            Dein Konto ist eingerichtet. Melde dich jetzt an.
          </div>
        )}
        {zurueckgesetzt && (
          <div className="hinweis gut" role="status">
            Dein neues Passwort ist gespeichert.
          </div>
        )}

        <form action={absenden} className="stapel">
          <div className="stapel-eng">
            <label htmlFor="email">E-Mail-Adresse</label>
            <input id="email" name="email" type="email" autoComplete="username"
                   inputMode="email" required placeholder="name@beispiel.ch" />
          </div>

          <div className="stapel-eng">
            <label htmlFor="passwort">Passwort</label>
            <input id="passwort" name="passwort" type="password"
                   autoComplete="current-password" required />
          </div>

          <input type="hidden" name="weiter" value={weiter ?? '/'} />

          {ergebnis.status === 'fehler' && (
            <div className="hinweis warn" role="alert">{ergebnis.meldung}</div>
          )}

          <button type="submit" disabled={laeuft}>
            {laeuft ? 'Wird geprüft …' : 'Anmelden'}
          </button>
        </form>

        <p className="leise">
          <Link href="/passwort-vergessen">Passwort vergessen?</Link>
        </p>
      </div>
    </main>
  )
}
