'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Marke } from '@/components/Marke'
import { sendeZuruecksetzen, type ResetErgebnis } from './actions'

const START: ResetErgebnis = { status: 'idle' }

export default function PasswortVergessenSeite() {
  const [ergebnis, absenden, laeuft] = useActionState(sendeZuruecksetzen, START)

  return (
    <main className="huelle huelle-schmal">
      <Marke />
      <div className="stapel">
        <h1>Passwort vergessen</h1>

        {ergebnis.status === 'gesendet' ? (
          <>
            <div className="hinweis gut" role="status">
              Falls für diese Adresse ein Zugang besteht, ist eine E-Mail unterwegs.
              Schau auch im Spam-Ordner nach.
            </div>
            <p className="leise">
              Nichts erhalten? Melde dich bei Vinamo, wir richten dir ein neues
              Startpasswort ein.
            </p>
          </>
        ) : (
          <form action={absenden} className="stapel">
            <div className="stapel-eng">
              <label htmlFor="email">E-Mail-Adresse</label>
              <input id="email" name="email" type="email" autoComplete="username"
                     inputMode="email" required placeholder="name@beispiel.ch" />
            </div>
            {ergebnis.status === 'fehler' && (
              <div className="hinweis warn" role="alert">{ergebnis.meldung}</div>
            )}
            <button type="submit" disabled={laeuft}>
              {laeuft ? 'Wird gesendet …' : 'Link schicken'}
            </button>
          </form>
        )}

        <p className="leise"><Link href="/login">Zurück zur Anmeldung</Link></p>
      </div>
    </main>
  )
}
