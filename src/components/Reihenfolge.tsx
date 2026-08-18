'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

/**
 * Reihenfolge einer Liste ändern.
 *
 * `sortiere()` gab es seit Phase 2, angeschlossen war sie an nichts -- bei
 * Speisekarte, Team und Leistungen bestimmte die Anlagereihenfolge, was auf der
 * Website oben steht, und ändern liess sich das gar nicht.
 *
 * Hoch/Runter statt Ziehen: Auf dem Handy ist Drag & Drop in einer scrollenden
 * Liste unzuverlässig -- und die Wirtin sortiert ihre Karte genau dort. Mit
 * Knöpfen funktioniert es auf jedem Gerät, mit der Tastatur, und mit
 * Screenreader.
 */
export function Reihenfolge({
  tenantSlug, typeKey, reihenfolge, index, sortiere,
}: {
  tenantSlug: string
  typeKey: string
  /** Alle Eintrags-Kennungen in der aktuellen Reihenfolge. */
  reihenfolge: string[]
  index: number
  sortiere: (tenantSlug: string, typeKey: string, reihenfolge: string[]) => Promise<void>
}) {
  const router = useRouter()
  const [laeuft, starte] = useTransition()

  const verschiebe = (um: number) => {
    const ziel = index + um
    if (ziel < 0 || ziel >= reihenfolge.length) return
    const kopie = [...reihenfolge]
    ;[kopie[index], kopie[ziel]] = [kopie[ziel], kopie[index]]
    starte(async () => {
      await sortiere(tenantSlug, typeKey, kopie)
      router.refresh()
    })
  }

  return (
    <span className="reihenfolge">
      <button type="button" className="knopf-klein" aria-label="Nach oben"
              disabled={laeuft || index === 0}
              onClick={() => verschiebe(-1)}>↑</button>
      <button type="button" className="knopf-klein" aria-label="Nach unten"
              disabled={laeuft || index === reihenfolge.length - 1}
              onClick={() => verschiebe(1)}>↓</button>
    </span>
  )
}
