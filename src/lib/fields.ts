/**
 * Feldtyp-Register.
 *
 * Jeder Feldtyp bringt an genau einer Stelle mit, was das System über ihn wissen
 * muss: ob er übersetzbar sein darf, wie ein leerer Wert aussieht und wie ein
 * Wert geprüft wird. Einen dreizehnten Feldtyp zu ergänzen heisst danach: einen
 * Eintrag hier und einen Zweig in der Feldkomponente -- kein Eingriff in
 * bestehende Verzweigungen an vier verstreuten Stellen.
 */

export type FieldType =
  | 'text' | 'textarea' | 'richtext' | 'number' | 'price' | 'date' | 'datetime'
  | 'boolean' | 'select' | 'multiselect' | 'media' | 'repeater' | 'reference'

export type FieldConfig = {
  options?: string[]
  currency?: string
  min?: number
  max?: number
  maxLength?: number
  aspectRatio?: string
  targetContentType?: string
}

export type Field = {
  id: string
  key: string
  type: FieldType
  label: string
  help: string
  required: boolean
  translatable: boolean
  config: FieldConfig
  position: number
  children: Field[]
}

export type ContentType = {
  id: string
  key: string
  name: string
  namePlural: string
  kind: 'single' | 'collection'
  sortable: boolean
  hasSlug: boolean
  supportsSlots: boolean
  description: string
  fields: Field[]
}

export type FieldValues = Record<string, unknown>
export type RepeaterRow = { _id: string } & Record<string, unknown>

/** Kann dieser Typ überhaupt übersetzbar sein? Spiegelt den Constraint in 0009. */
export const TRANSLATABLE_TYPES: ReadonlySet<FieldType> = new Set([
  'text', 'textarea', 'richtext', 'select', 'multiselect',
])

export function leererWert(field: Field): unknown {
  switch (field.type) {
    case 'boolean':     return false
    case 'multiselect': return []
    case 'repeater':    return []
    case 'number':
    case 'price':       return null
    default:            return ''
  }
}

/**
 * Neue Zeile einer Wiederholgruppe mit stabiler ID.
 *
 * Die _id ist der Angelpunkt der ganzen Mehrsprachigkeit: Übersetzungen
 * verbinden sich über sie, nie über die Position im Array. Ohne sie sitzen nach
 * dem Einfügen einer Zeile in der Mitte alle Übersetzungen an den falschen
 * Preisen -- still, und sofort öffentlich sichtbar.
 */
export function neueZeile(feld: Field): RepeaterRow {
  const zeile: RepeaterRow = { _id: crypto.randomUUID() }
  for (const kind of feld.children) {
    if (!kind.translatable) zeile[kind.key] = leererWert(kind)
  }
  return zeile
}

export type Fehler = { pfad: string; meldung: string }

const ZAHL = /^-?\d+([.,]\d+)?$/

function pruefeEinzelwert(feld: Field, wert: unknown, pfad: string): Fehler[] {
  const fehler: Fehler[] = []
  const leer =
    wert === null || wert === undefined ||
    (typeof wert === 'string' && wert.trim() === '') ||
    (Array.isArray(wert) && wert.length === 0)

  if (feld.required && leer) {
    return [{ pfad, meldung: `${feld.label} ist ein Pflichtfeld.` }]
  }
  if (leer) return fehler

  switch (feld.type) {
    case 'text':
    case 'textarea':
    case 'richtext': {
      if (typeof wert !== 'string') {
        fehler.push({ pfad, meldung: `${feld.label} muss Text sein.` })
        break
      }
      const max = feld.config.maxLength ?? (feld.type === 'text' ? 300 : 20000)
      if (wert.length > max) {
        fehler.push({ pfad, meldung: `${feld.label} ist zu lang (höchstens ${max} Zeichen).` })
      }
      break
    }

    case 'number':
    case 'price': {
      const zahl = typeof wert === 'number' ? wert : Number(String(wert).replace(',', '.'))
      if (typeof wert === 'string' && !ZAHL.test(wert.trim())) {
        fehler.push({ pfad, meldung: `${feld.label} muss eine Zahl sein, z.B. 24.50.` })
        break
      }
      if (!Number.isFinite(zahl)) {
        fehler.push({ pfad, meldung: `${feld.label} muss eine Zahl sein.` })
        break
      }
      if (feld.type === 'price' && zahl < 0) {
        fehler.push({ pfad, meldung: `${feld.label} darf nicht negativ sein.` })
      }
      if (feld.config.min !== undefined && zahl < feld.config.min) {
        fehler.push({ pfad, meldung: `${feld.label} muss mindestens ${feld.config.min} sein.` })
      }
      if (feld.config.max !== undefined && zahl > feld.config.max) {
        fehler.push({ pfad, meldung: `${feld.label} darf höchstens ${feld.config.max} sein.` })
      }
      break
    }

    case 'date':
    case 'datetime':
      if (Number.isNaN(Date.parse(String(wert)))) {
        fehler.push({ pfad, meldung: `${feld.label} ist kein gültiges Datum.` })
      }
      break

    case 'boolean':
      if (typeof wert !== 'boolean') {
        fehler.push({ pfad, meldung: `${feld.label} muss ja oder nein sein.` })
      }
      break

    case 'select':
      if (feld.config.options && !feld.config.options.includes(String(wert))) {
        fehler.push({ pfad, meldung: `${feld.label}: „${String(wert)}" ist keine gültige Auswahl.` })
      }
      break

    case 'multiselect': {
      if (!Array.isArray(wert)) {
        fehler.push({ pfad, meldung: `${feld.label} muss eine Liste sein.` })
        break
      }
      const erlaubt = feld.config.options
      if (erlaubt) {
        for (const einzel of wert) {
          if (!erlaubt.includes(String(einzel))) {
            fehler.push({ pfad, meldung: `${feld.label}: „${String(einzel)}" ist keine gültige Auswahl.` })
          }
        }
      }
      break
    }

    case 'media':
    case 'reference':
      if (typeof wert !== 'string' || !/^[0-9a-f-]{36}$/i.test(wert)) {
        fehler.push({ pfad, meldung: `${feld.label} verweist auf nichts Gültiges.` })
      }
      break

    case 'repeater':
      // wird in pruefeWerte zeilenweise behandelt
      break
  }

  return fehler
}

/**
 * Prüft einen vollständigen Eintrag.
 *
 * Diese Funktion ist die einzige Stelle, an der über Gültigkeit entschieden
 * wird. Sie läuft ausschliesslich auf dem Server -- deshalb gibt es keinen
 * schreibfähigen Supabase-Client im Browser, sonst wäre sie mit der
 * Entwicklerkonsole umgehbar.
 *
 * Pflichtfelder werden nur in der Hauptsprache erzwungen. Eine fehlende
 * französische Übersetzung ist kein Fehler, sondern der Fallback-Fall.
 */
export function pruefeWerte(
  felder: Field[],
  basis: FieldValues,
  uebersetzungen: Record<string, FieldValues>,
  hauptsprache: string,
): Fehler[] {
  const fehler: Fehler[] = []
  const haupt = uebersetzungen[hauptsprache] ?? {}

  for (const feld of felder) {
    if (feld.type === 'repeater') {
      const zeilen = basis[feld.key]
      if (!Array.isArray(zeilen)) {
        if (zeilen !== undefined) {
          fehler.push({ pfad: feld.key, meldung: `${feld.label} muss eine Liste sein.` })
        }
        continue
      }

      zeilen.forEach((zeile, i) => {
        const row = zeile as RepeaterRow
        if (typeof row._id !== 'string' || row._id.length < 10) {
          // Ohne stabile ID ist die Zeile nicht übersetzbar. Lieber hier hart
          // ablehnen als still eine unübersetzbare Zeile speichern.
          fehler.push({ pfad: `${feld.key}[${i}]`, meldung: 'Zeile ohne gültige Kennung.' })
          return
        }
        for (const kind of feld.children) {
          const wert = kind.translatable
            ? (haupt[feld.key] as Record<string, FieldValues> | undefined)?.[row._id]?.[kind.key]
            : row[kind.key]
          fehler.push(...pruefeEinzelwert(kind, wert, `${feld.key}[${i}].${kind.key}`))
        }
      })
      continue
    }

    const wert = feld.translatable ? haupt[feld.key] : basis[feld.key]
    fehler.push(...pruefeEinzelwert(feld, wert, feld.key))
  }

  return fehler
}

/**
 * Übersetzungsstand einer Sprache.
 *
 * Der Kunde soll sehen, was noch offen ist, ohne jedes Feld durchzuklicken.
 */
export type Uebersetzungsstand = 'fehlt' | 'teilweise' | 'vollstaendig'

export function uebersetzungsstand(
  felder: Field[],
  basis: FieldValues,
  werte: FieldValues,
): Uebersetzungsstand {
  let gesamt = 0
  let gefuellt = 0

  const zaehle = (wert: unknown) => {
    gesamt++
    if (typeof wert === 'string' ? wert.trim() !== '' : wert !== null && wert !== undefined) {
      gefuellt++
    }
  }

  for (const feld of felder) {
    if (feld.type === 'repeater') {
      const zeilen = Array.isArray(basis[feld.key]) ? (basis[feld.key] as RepeaterRow[]) : []
      const uebersetzt = (werte[feld.key] ?? {}) as Record<string, FieldValues>
      for (const zeile of zeilen) {
        for (const kind of feld.children) {
          if (kind.translatable) zaehle(uebersetzt[zeile._id]?.[kind.key])
        }
      }
      continue
    }
    if (feld.translatable) zaehle(werte[feld.key])
  }

  if (gesamt === 0) return 'vollstaendig'
  if (gefuellt === 0) return 'fehlt'
  return gefuellt === gesamt ? 'vollstaendig' : 'teilweise'
}

/** Aus einem Titel einen URL-Abschnitt machen. Schweizer Umlaute ausgeschrieben. */
export function zuSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[àáâã]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõ]/g, 'o').replace(/[ùúû]/g, 'u').replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
