import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Öffentliche Adressen eines Mediendatensatzes.
 *
 * An EINER Stelle, weil sie an dreien gebraucht werden: im Editor für die
 * Vorschau, in der Lese-API für die Kundenwebsite und im Export. Vorher stand
 * das Zusammensetzen nur in der Anleitung -- jeder Aufrufer hätte es selbst
 * gebaut, und der erste Tippfehler wäre erst auf einer Kundenwebsite
 * aufgefallen.
 *
 * Der Bucket ist öffentlich lesbar; das ist Absicht und dokumentiert. Die
 * Bilder stehen ohnehin auf Kundenwebsites, eine signierte Adresse wäre ein
 * Umweg ohne Gewinn.
 */

type Variante = { w: number; path: string; bytes?: number }

export type MedienZeile = {
  path: string
  mime: string
  width: number | null
  height: number | null
  variants: Variante[] | null
}

export type MedienAdressen = {
  /** Die grösste Variante -- was man meint, wenn man „das Bild" sagt. */
  url: string | null
  /** Kleinste Variante, für Vorschauen im Admin. */
  vorschau_url: string | null
  /** Fertiges srcset, leer bei Dateien ohne Breiten (PDF). */
  srcset: string | null
}

export function medienAdressen(medium: MedienZeile): MedienAdressen {
  const basis = process.env.SUPABASE_URL
  if (!basis) return { url: null, vorschau_url: null, srcset: null }

  const adresse = (pfad: string) => `${basis}/storage/v1/object/public/media/${pfad}`
  const mitBreite = (medium.variants ?? []).filter((v) => v.w > 0)

  if (mitBreite.length === 0) {
    const eine = adresse(medium.path)
    return { url: eine, vorschau_url: eine, srcset: null }
  }

  const sortiert = [...mitBreite].sort((a, b) => a.w - b.w)
  return {
    url: adresse(sortiert[sortiert.length - 1].path),
    vorschau_url: adresse(sortiert[0].path),
    srcset: sortiert.map((v) => `${adresse(v.path)} ${v.w}w`).join(', '),
  }
}

/**
 * Ersetzt in einer API-Antwort jede Medienkennung durch ein Objekt mit Adressen.
 *
 * Aus
 *   "image": "2ad5b36c-…"
 * wird
 *   "image": { "id": "2ad5b36c-…", "url": "https://…-1600.webp",
 *              "srcset": "…400w, …800w", "alt": "Terrasse im Sommer",
 *              "width": 1600, "height": 900, "mime": "image/webp" }
 *
 * Ein einziger Datenbankzugriff für alle Kennungen der Antwort, egal wie viele
 * Einträge und Wiederholzeilen darin stecken. Die Alternative -- die
 * Kundenwebsite holt jedes Bild selbst nach -- wäre pro Seite ein Dutzend
 * zusätzlicher Abrufe gegen ein Backend, das genau deshalb nicht im
 * Auslieferungspfad stehen soll.
 *
 * Verändert das übergebene Objekt an Ort und Stelle: Es ist die frisch aus der
 * Datenbank gebaute Antwort, kein geteilter Zustand.
 */
export async function medienAufloesen(
  admin: SupabaseClient,
  antwort: unknown,
): Promise<void> {
  const kennungen = new Set<string>()
  sammle(antwort, kennungen)
  if (kennungen.size === 0) return

  const locale = (antwort as { locale?: string })?.locale ?? 'de'
  const fallback = (antwort as { fallback_locale?: string })?.fallback_locale ?? locale

  const { data: roh } = await admin
    .from('media')
    .select('id, path, mime, bytes, width, height, variants, media_translations(locale, alt)')
    .in('id', [...kennungen])

  const medien = (roh ?? []) as unknown as MedienMitTexten[]
  if (medien.length === 0) return

  const nach = new Map<string, unknown>()
  for (const m of medien) {
    const alte = (m.media_translations ?? []) as { locale: string; alt: string }[]
    const alt = alte.find((a) => a.locale === locale)?.alt
      || alte.find((a) => a.locale === fallback)?.alt
      || ''
    nach.set(m.id, {
      id: m.id, mime: m.mime, bytes: m.bytes,
      width: m.width, height: m.height, alt,
      ...medienAdressen(m),
    })
  }

  ersetze(antwort, nach)
}

type MedienMitTexten = MedienZeile & {
  id: string
  bytes: number
  media_translations?: { locale: string; alt: string }[] | null
}

const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Alle Medienkennungen einsammeln.
 *
 * Erkannt wird an der Form, nicht am Feldnamen: Die Antwort weiss nicht mehr,
 * welches Feld vom Typ „media" war -- diese Information steht in `fields` und
 * wäre ein zweiter Datenbankzugriff, nur um zu erfahren, was eine UUID ohnehin
 * verrät. Ein Textfeld, in dem zufällig eine UUID steht, würde mitgenommen --
 * es ist dann aber keine bekannte Medienkennung und bleibt unverändert.
 */
function sammle(wert: unknown, ziel: Set<string>): void {
  if (typeof wert === 'string') {
    if (KENNUNG.test(wert)) ziel.add(wert)
    return
  }
  if (Array.isArray(wert)) { for (const e of wert) sammle(e, ziel); return }
  if (wert && typeof wert === 'object') {
    for (const [k, v] of Object.entries(wert)) {
      // _id ist die Zeilenkennung einer Wiederholgruppe, kein Medium.
      if (k === '_id' || k === 'id') continue
      sammle(v, ziel)
    }
  }
}

function ersetze(wert: unknown, nach: Map<string, unknown>): void {
  if (Array.isArray(wert)) {
    for (let i = 0; i < wert.length; i++) {
      const e = wert[i]
      if (typeof e === 'string' && nach.has(e)) wert[i] = nach.get(e)
      else ersetze(e, nach)
    }
    return
  }
  if (wert && typeof wert === 'object') {
    for (const [k, v] of Object.entries(wert)) {
      if (k === '_id' || k === 'id') continue
      if (typeof v === 'string' && nach.has(v)) {
        (wert as Record<string, unknown>)[k] = nach.get(v)
      } else {
        ersetze(v, nach)
      }
    }
  }
}
