'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Bild oder Datei hochladen und auswählen.
 *
 * Ersetzt das, was vorher an dieser Stelle stand: ein Textfeld mit dem
 * Platzhalter „Kennung". Der Kunde hätte dort eine UUID eintippen müssen, die
 * er nirgends sehen konnte -- ein Bildfeld, in das sich kein Bild einsetzen
 * liess.
 *
 * Bewusst KEINE Mediathek mit Ordnern, Suche und Mehrfachauswahl. Ein
 * KMU-Kunde lädt ein Foto pro Teammitglied und eine Karte pro Woche hoch; eine
 * Bibliothek wäre eine zweite Anwendung, die er nie füllt. Die Wiederverwendung
 * regelt die Prüfsumme im Hintergrund: Dasselbe Bild zweimal hochgeladen ergibt
 * denselben Datensatz.
 */

export type MedienDatensatz = {
  id: string
  path: string
  mime: string
  bytes: number
  width: number | null
  height: number | null
  original_name: string
  /** Vom Server fertig gebaut -- der Browser setzt keine Speicheradressen zusammen. */
  url: string | null
  vorschau_url: string | null
}

const MAX_BYTES = 15 * 1024 * 1024

export function Dateifeld({
  id, tenantId, wert, nurDokumente, gesperrt, onChange, beschreibung,
}: {
  id: string
  tenantId: string
  wert: string | null
  /** true beim Feldtyp „file": PDF statt Bild. */
  nurDokumente?: boolean
  gesperrt?: boolean
  onChange: (medienId: string | null) => void
  beschreibung?: string
}) {
  const [medium, setMedium] = useState<MedienDatensatz | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const eingabe = useRef<HTMLInputElement>(null)

  // Beim Öffnen eines bestehenden Eintrags steht im Feld nur die Kennung. Ohne
  // dieses Nachladen sähe der Kunde „Bild gesetzt" ohne zu wissen, welches.
  useEffect(() => {
    let abgebrochen = false
    if (!wert) { setMedium(null); return }
    if (medium?.id === wert) return
    fetch(`/api/media/${wert}`)
      .then((a) => (a.ok ? a.json() : null))
      .then((d) => { if (!abgebrochen && d?.media) setMedium(d.media) })
      .catch(() => {})
    return () => { abgebrochen = true }
  }, [wert, medium?.id])

  const hochladen = async (datei: File) => {
    setFehler(null)
    if (datei.size > MAX_BYTES) {
      setFehler('Die Datei ist grösser als 15 MB. Bitte eine kleinere wählen.')
      return
    }
    setLaeuft(true)
    try {
      const formular = new FormData()
      formular.append('datei', datei)
      formular.append('tenant_id', tenantId)
      const antwort = await fetch('/api/media', { method: 'POST', body: formular })
      const daten = await antwort.json().catch(() => ({}))
      if (!antwort.ok) {
        setFehler(daten.error ?? 'Der Upload hat nicht geklappt.')
        return
      }
      setMedium(daten.media)
      onChange(daten.media.id)
    } catch {
      setFehler('Der Upload hat nicht geklappt. Verbindung prüfen und nochmals versuchen.')
    } finally {
      setLaeuft(false)
      if (eingabe.current) eingabe.current.value = ''
    }
  }

  const vorschau = medium?.vorschau_url ?? null
  const gross = medium?.url ?? null
  const istBild = medium?.mime?.startsWith('image/')

  return (
    <div className="stapel-eng">
      {medium && (
        <div className="datei-vorschau">
          {istBild && vorschau ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vorschau} alt="" className="datei-bild" />
          ) : (
            <span className="datei-symbol" aria-hidden="true">PDF</span>
          )}
          <span className="stapel-eng" style={{ minWidth: 0 }}>
            <strong className="umbruch">{medium.original_name || 'Ohne Namen'}</strong>
            <span className="leise">
              {kilobyte(medium.bytes)}
              {medium.width ? ` · ${medium.width}×${medium.height} px` : ''}
            </span>
            {gross && (
              <a href={gross} target="_blank" rel="noreferrer" className="leise">
                In neuem Tab ansehen
              </a>
            )}
          </span>
          <button type="button" className="knopf-klein knopf-weg" disabled={gesperrt || laeuft}
                  aria-label="Entfernen"
                  onClick={() => { setMedium(null); onChange(null) }}>
            ×
          </button>
        </div>
      )}

      <input
        ref={eingabe}
        id={id}
        type="file"
        accept={nurDokumente ? 'application/pdf' : 'image/jpeg,image/png,image/webp,image/avif,image/heic'}
        disabled={gesperrt || laeuft}
        aria-describedby={beschreibung}
        onChange={(e) => { const d = e.target.files?.[0]; if (d) void hochladen(d) }}
      />

      {laeuft && <p className="leise" role="status">Wird hochgeladen …</p>}
      {fehler && <div className="hinweis warn" role="alert">{fehler}</div>}
    </div>
  )
}

function kilobyte(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
