'use client'

/**
 * Letzte Fehlergrenze. Greift, wenn schon das Wurzel-Layout scheitert -- dann
 * gibt es weder Stile noch Schriften, deshalb steht hier alles inline.
 */
export default function GlobalError({
  error,
}: { error: Error & { digest?: string } }) {
  return (
    <html lang="de">
      <body style={{
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        background: '#FBFAF9', color: '#1B1B33',
        margin: 0, padding: '48px 24px', lineHeight: 1.6,
      }}>
        <div style={{ maxWidth: 400, margin: '0 auto' }}>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>Vinamo ist gerade nicht erreichbar</h1>
          <p style={{ color: '#55516E' }}>
            Bitte in ein paar Minuten nochmals versuchen. Deine Inhalte sind
            davon nicht betroffen.
          </p>
          {error.digest && (
            <p style={{ marginTop: 24, fontFamily: 'ui-monospace, monospace', fontSize: 13, color: '#55516E' }}>
              Kennung: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
