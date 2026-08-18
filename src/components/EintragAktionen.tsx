'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

type Ergebnis = { ok: true; gespeichertUm: string } | { ok: false; fehler: { meldung: string }[] }

/**
 * Aktionen zu einem Eintrag: zurücksetzen, archivieren, löschen.
 *
 * Bewusst unten und eingeklappt. Die drei Knöpfe sind selten nötig, und zwei
 * davon nehmen etwas von der Website -- die gehören nicht neben "Veröffentlichen".
 */
export function EintragAktionen({
  tenantSlug, typeKey, entryId, istArchiviert, hatVersion,
  wiederherstellen, archivieren, loeschen,
}: {
  tenantSlug: string; typeKey: string; entryId: string
  istArchiviert: boolean; hatVersion: boolean
  wiederherstellen: (t: string, k: string, id: string) => Promise<Ergebnis>
  archivieren: (t: string, k: string, id: string, an: boolean) => Promise<Ergebnis>
  loeschen: (t: string, k: string, id: string) => Promise<Ergebnis>
}) {
  const router = useRouter()
  const [meldung, setMeldung] = useState<string | null>(null)
  const [laeuft, starte] = useTransition()

  const tun = (fn: () => Promise<Ergebnis>, danach?: () => void) =>
    starte(async () => {
      const e = await fn()
      if (e.ok) { setMeldung(null); danach ? danach() : router.refresh() }
      else setMeldung(e.fehler[0]?.meldung ?? 'Das hat nicht geklappt.')
    })

  return (
    <details className="karte">
      <summary><strong>Weitere Aktionen</strong></summary>
      <div className="stapel-eng" style={{ marginTop: 12 }}>
        {meldung && <div className="hinweis warn" role="alert">{meldung}</div>}

        {hatVersion && (
          <>
            <p className="leise">
              Verwirft deine ungespeicherten Änderungen und holt zurück, was
              gerade auf der Website steht. Die Website selbst ändert sich nicht.
            </p>
            <button type="button" className="knopf-zweit" disabled={laeuft}
                    onClick={() => {
                      if (!confirm('Entwurf auf den veröffentlichten Stand zurücksetzen? Nicht veröffentlichte Änderungen gehen verloren.')) return
                      tun(() => wiederherstellen(tenantSlug, typeKey, entryId))
                    }}>
              Entwurf zurücksetzen
            </button>
          </>
        )}

        <p className="leise">
          {istArchiviert
            ? 'Der Eintrag ist zurzeit nicht auf der Website. Zurückholen macht ihn wieder zum Entwurf, den du erneut veröffentlichen kannst.'
            : 'Nimmt den Eintrag von der Website, behält ihn aber hier. Du kannst ihn jederzeit zurückholen.'}
        </p>
        <button type="button" className="knopf-zweit" disabled={laeuft}
                onClick={() => tun(() => archivieren(tenantSlug, typeKey, entryId, !istArchiviert))}>
          {istArchiviert ? 'Zurückholen' : 'Von der Website nehmen'}
        </button>

        <p className="leise">
          Löscht den Eintrag samt Übersetzungen und Versionsverlauf. Das lässt
          sich nicht rückgängig machen. Wenn er nur von der Website verschwinden
          soll, nimm ihn oben von der Website.
        </p>
        <button type="button" className="knopf-klein knopf-weg" disabled={laeuft}
                onClick={() => {
                  if (!confirm('Diesen Eintrag endgültig löschen? Das lässt sich nicht rückgängig machen.')) return
                  tun(() => loeschen(tenantSlug, typeKey, entryId),
                      () => router.push(`/t/${tenantSlug}/${typeKey}`))
                }}>
          Endgültig löschen
        </button>
      </div>
    </details>
  )
}
