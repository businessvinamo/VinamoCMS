import Link from 'next/link'
import { abmelden } from '@/app/login/actions'

/**
 * Kopfzeile mit Marke, Einstellungen und Abmelden.
 *
 * Vorher gab es keine Navigation: Die Abmelde-Aktion existierte, war aber an
 * keinen Knopf angeschlossen -- niemand konnte sich abmelden. Auf einem
 * gemeinsam genutzten Gerät im Restaurant ist das kein Schönheitsfehler.
 */
export function Kopfzeile({ email }: { email?: string | null }) {
  return (
    <header className="kopf">
      <Link href="/" className="marke" aria-label="Zur Übersicht">
        <svg width="24" height="24" viewBox="0 0 100 100" aria-hidden="true">
          <path d="M8 12 L34 12 L58 78 L44 88 Z" fill="#5B3DF5" />
          <path d="M92 12 L66 12 L50 56 L60 70 Z" fill="currentColor" />
        </svg>
        <span>Vinamo</span>
      </Link>

      {email && (
        <nav className="kopf-rechts">
          <Link href="/einstellungen" className="kopf-link">
            <span className="visuell-versteckt">Einstellungen für {email}</span>
            <span aria-hidden="true">Einstellungen</span>
          </Link>
          <form action={abmelden}>
            <button type="submit" className="kopf-link">Abmelden</button>
          </form>
        </nav>
      )}
    </header>
  )
}
