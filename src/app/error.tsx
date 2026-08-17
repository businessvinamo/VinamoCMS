'use client'

import { useEffect } from 'react'

/**
 * Fehlergrenze für alle Seiten.
 *
 * Ohne sie zeigt Next.js "Application error: a client-side exception has
 * occurred" -- eine Meldung, die weder dem Kunden noch uns etwas sagt. Diese
 * Seite nennt wenigstens die Kennung, die im Serverprotokoll steht, sodass sich
 * die zwei Enden verbinden lassen.
 */
export default function Fehlerseite({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[vinamo] Seitenfehler', error.digest ?? '(ohne Kennung)', error.message)
  }, [error])

  return (
    <main className="huelle huelle-schmal">
      <div className="stapel">
        <h1>Da ist etwas schiefgelaufen</h1>
        <p className="leise">
          Die Seite konnte nicht geladen werden. Deine Inhalte sind davon nicht
          betroffen — es ist nichts verloren gegangen.
        </p>

        <div className="karte">
          <h2>Was du tun kannst</h2>
          <p className="leise">Zuerst neu laden. Bleibt es dabei, schick uns die Kennung unten.</p>
          <button type="button" onClick={reset}>Nochmals versuchen</button>
        </div>

        {error.digest && (
          <div className="stapel-eng">
            <span className="leise">Kennung für den Support</span>
            <code className="mono">{error.digest}</code>
          </div>
        )}
      </div>
    </main>
  )
}
