'use client'

import type { Field, RepeaterRow } from '@/lib/fields'
import { neueZeile } from '@/lib/fields'

/**
 * Feldkomponente.
 *
 * Bewusst ohne Formularbibliothek: Die Feldtypen kommen aus der Datenbank, nicht
 * aus einem statischen Schema, und die Wertestruktur ist zwischen Basis und
 * Übersetzung geteilt. Eine Bibliothek müsste hier mehr verbogen werden, als sie
 * abnimmt.
 */

type Props = {
  feld: Field
  wert: unknown
  onChange: (wert: unknown) => void
  gesperrt?: boolean
  /** Wert der Hauptsprache, wenn gerade eine Übersetzung bearbeitet wird. */
  vorlage?: unknown
}

export function Feld({ feld, wert, onChange, gesperrt, vorlage }: Props) {
  const id = `feld-${feld.id}`
  const gemeinsam = { id, disabled: gesperrt, 'aria-describedby': feld.help ? `${id}-hilfe` : undefined }

  return (
    <div className="stapel-eng">
      <label htmlFor={id}>
        {feld.label}
        {feld.required && <span aria-hidden="true" style={{ color: 'var(--violett)' }}> *</span>}
      </label>
      {feld.help && <p id={`${id}-hilfe`} className="leise">{feld.help}</p>}

      {eingabe(feld, wert, onChange, gemeinsam)}

      {vorlage !== undefined && vorlage !== null && vorlage !== '' && leerWert(wert) && (
        <p className="leise">
          Noch nicht übersetzt. Auf der Website erscheint: „{String(vorlage).slice(0, 80)}"
        </p>
      )}
    </div>
  )
}

function leerWert(w: unknown) {
  return w === null || w === undefined || (typeof w === 'string' && w.trim() === '')
}

type Gemeinsam = { id: string; disabled?: boolean; 'aria-describedby'?: string }

function eingabe(feld: Field, wert: unknown, onChange: (w: unknown) => void, g: Gemeinsam) {
  switch (feld.type) {
    case 'textarea':
    case 'richtext':
      return (
        <textarea
          {...g}
          rows={feld.type === 'richtext' ? 8 : 3}
          value={String(wert ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'boolean':
      return (
        <label className="zeile" style={{ cursor: 'pointer' }}>
          <input
            {...g}
            type="checkbox"
            checked={wert === true}
            onChange={(e) => onChange(e.target.checked)}
            style={{ width: 24, height: 24 }}
          />
          <span className="leise">{wert === true ? 'Ja' : 'Nein'}</span>
        </label>
      )

    case 'number':
    case 'price':
      return (
        <input
          {...g}
          type="text"
          inputMode="decimal"
          value={wert === null || wert === undefined ? '' : String(wert)}
          placeholder={feld.type === 'price' ? '24.50' : ''}
          onChange={(e) => {
            const roh = e.target.value.trim().replace(',', '.')
            onChange(roh === '' ? null : Number.isNaN(Number(roh)) ? e.target.value : Number(roh))
          }}
        />
      )

    case 'date':
      return (
        <input {...g} type="date" value={String(wert ?? '').slice(0, 10)}
               onChange={(e) => onChange(e.target.value || null)} />
      )

    case 'datetime':
      return (
        <input {...g} type="datetime-local" value={String(wert ?? '').slice(0, 16)}
               onChange={(e) => onChange(e.target.value || null)} />
      )

    case 'select':
      return (
        <select {...g} value={String(wert ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">Bitte wählen</option>
          {(feld.config.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )

    case 'multiselect': {
      const gewaehlt = Array.isArray(wert) ? (wert as string[]) : []
      return (
        <div className="chips">
          {(feld.config.options ?? []).map((o) => {
            const an = gewaehlt.includes(o)
            return (
              <button
                key={o}
                type="button"
                disabled={g.disabled}
                aria-pressed={an}
                className={an ? 'chip chip-an' : 'chip'}
                onClick={() => onChange(an ? gewaehlt.filter((x) => x !== o) : [...gewaehlt, o])}
              >
                {o}
              </button>
            )
          })}
        </div>
      )
    }

    case 'repeater':
      return <Wiederholgruppe feld={feld} zeilen={Array.isArray(wert) ? (wert as RepeaterRow[]) : []}
                              onChange={onChange} gesperrt={g.disabled} />

    case 'media':
    case 'reference':
      return (
        <input {...g} type="text" value={String(wert ?? '')}
               placeholder="Kennung" onChange={(e) => onChange(e.target.value || null)} />
      )

    default:
      return (
        <input {...g} type="text" value={String(wert ?? '')}
               onChange={(e) => onChange(e.target.value)} />
      )
  }
}

/**
 * Wiederholgruppe.
 *
 * Zeigt ausschliesslich die NICHT übersetzbaren Unterfelder -- Preis, Allergene.
 * Die übersetzbaren Unterfelder erscheinen im Sprachbereich darunter, damit die
 * Wirtin den Preis genau einmal pflegt und nicht viermal.
 *
 * Sortiert wird mit Hoch/Runter-Knöpfen statt echtem Ziehen: Auf dem Handy ist
 * Drag & Drop in einer scrollenden Liste unzuverlässig, und Tastaturbedienung
 * bekommt man gratis dazu.
 */
function Wiederholgruppe({
  feld, zeilen, onChange, gesperrt,
}: {
  feld: Field; zeilen: RepeaterRow[]; onChange: (w: unknown) => void; gesperrt?: boolean
}) {
  const eigene = feld.children.filter((k) => !k.translatable)

  const setze = (i: number, key: string, v: unknown) => {
    const kopie = zeilen.map((z, j) => (j === i ? { ...z, [key]: v } : z))
    onChange(kopie)
  }
  const verschiebe = (i: number, um: number) => {
    const ziel = i + um
    if (ziel < 0 || ziel >= zeilen.length) return
    const kopie = [...zeilen]
    ;[kopie[i], kopie[ziel]] = [kopie[ziel], kopie[i]]
    onChange(kopie)
  }

  return (
    <div className="stapel-eng">
      {zeilen.map((zeile, i) => (
        <div key={zeile._id} className="zeile-karte">
          <div className="zeile">
            <span className="leise mono">{i + 1}</span>
            <span style={{ display: 'flex', gap: 4 }}>
              <button type="button" className="knopf-klein" disabled={gesperrt || i === 0}
                      aria-label="Nach oben" onClick={() => verschiebe(i, -1)}>↑</button>
              <button type="button" className="knopf-klein" disabled={gesperrt || i === zeilen.length - 1}
                      aria-label="Nach unten" onClick={() => verschiebe(i, 1)}>↓</button>
              <button type="button" className="knopf-klein knopf-weg" disabled={gesperrt}
                      aria-label="Zeile entfernen"
                      onClick={() => onChange(zeilen.filter((_, j) => j !== i))}>×</button>
            </span>
          </div>
          {eigene.map((kind) => (
            <Feld key={kind.id} feld={kind} wert={zeile[kind.key]} gesperrt={gesperrt}
                  onChange={(v) => setze(i, kind.key, v)} />
          ))}
        </div>
      ))}

      <button type="button" className="knopf-zweit" disabled={gesperrt}
              onClick={() => onChange([...zeilen, neueZeile(feld)])}>
        + Zeile hinzufügen
      </button>
    </div>
  )
}
