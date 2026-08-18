import 'server-only'
import { timingSafeEqual } from 'node:crypto'

/**
 * Zeitkonstanter Vergleich zweier Geheimnisse.
 *
 * `a === b` bricht beim ersten abweichenden Zeichen ab. Über viele Anfragen
 * hinweg ist der Unterschied messbar, und aus messbar wird erratbar. Für das
 * Vorschau-Token und das Cron-Geheimnis ist das Risiko klein -- der Vergleich
 * ist aber genauso klein.
 *
 * Die Längen werden absichtlich vor timingSafeEqual geprüft: Die Funktion wirft
 * bei ungleicher Länge, und die Länge eines Geheimnisses ist ohnehin keine
 * Information, die es zu schützen gilt.
 */
export function geheimnisGleich(erwartet: string | undefined, geliefert: string | null): boolean {
  if (!erwartet || !geliefert) return false
  const a = Buffer.from(erwartet)
  const b = Buffer.from(geliefert)
  return a.length === b.length && timingSafeEqual(a, b)
}
