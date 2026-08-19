'use client'

import type { Field, RepeaterRow } from '@/lib/fields'
import { neueZeile } from '@/lib/fields'
import { useState } from 'react'
import { Dateifeld } from '@/components/Dateifeld'
import { Preisfeld } from '@/components/Preisfeld'

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
  umgebung: Feldumgebung
  gesperrt?: boolean
  /** Wert der Hauptsprache, wenn gerade eine Übersetzung bearbeitet wird. */
  vorlage?: unknown
}

export function Feld({ feld, wert, onChange, umgebung, gesperrt, vorlage }: Props) {
  const id = `feld-${feld.id}`
  const gemeinsam = { id, disabled: gesperrt, 'aria-describedby': feld.help ? `${id}-hilfe` : undefined }

  return (
    <div className="stapel-eng">
      <label htmlFor={id}>
        {feld.label}
        {feld.required && <span aria-hidden="true" style={{ color: 'var(--violett)' }}> *</span>}
      </label>
      {feld.help && <p id={`${id}-hilfe`} className="leise">{feld.help}</p>}

      {eingabe(feld, wert, onChange, gemeinsam, umgebung)}

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

/**
 * Umgebung, die einzelne Felder brauchen, aber nicht selbst kennen können:
 * die Kennung des Mandanten (für den Upload) und seine Währung.
 */
export type Feldumgebung = {
  tenantId: string
  waehrung: string
  /**
   * Liefert für eine Wiederholgruppe die übersetzbaren Unterfelder samt Zugriff
   * auf ihre Werte -- oder undefined, wenn gerade eine Übersetzung bearbeitet
   * wird und die Zeilenkarte ohne sie auskommt.
   */
  zeilenUebersetzung?: (feld: Field) => ZeilenUebersetzung | undefined
}

function eingabe(
  feld: Field, wert: unknown, onChange: (w: unknown) => void,
  g: Gemeinsam, umgebung: Feldumgebung,
) {
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
      return (
        <input
          {...g}
          type="text"
          inputMode="decimal"
          value={wert === null || wert === undefined ? '' : String(wert)}
          onChange={(e) => {
            const roh = e.target.value.trim().replace(',', '.')
            onChange(roh === '' ? null : Number.isNaN(Number(roh)) ? e.target.value : Number(roh))
          }}
        />
      )

    // Die Währung steht am Mandanten, nicht am Feld: Ein Betrieb rechnet in
    // einer Währung, und ein Kunde in Konstanz soll seine Preise nicht in
    // Franken auszeichnen.
    case 'price':
      return <Preisfeld {...g} wert={wert} waehrung={umgebung.waehrung} onChange={onChange} />

    // Echte Uhrzeit statt Freitext. Der Browser gibt „09:00" zurück, egal was
    // getippt wurde -- vorher stand hier ein Textfeld, in das „X" passte.
    case 'time':
      return (
        <input {...g} type="time" value={String(wert ?? '')}
               onChange={(e) => onChange(e.target.value || null)} />
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

    // Der Wert ist der Schlüssel, die Beschriftung nur Anzeige. Ohne diese
    // Trennung landet deutsches Wortmaterial in der französischen API-Antwort.
    case 'select':
      return (
        <select {...g} value={String(wert ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">Bitte wählen</option>
          {(feld.config.options ?? []).map((o) => (
            <option key={o} value={o}>{feld.config.option_labels?.[o] ?? o}</option>
          ))}
        </select>
      )

    case 'multiselect': {
      const gewaehlt = Array.isArray(wert) ? (wert as string[]) : []
      return (
        <Mehrfachauswahl feld={feld} gewaehlt={gewaehlt} onChange={onChange} g={g} />
      )
    }

    case 'repeater':
      return (
        <Wiederholgruppe
          feld={feld} zeilen={Array.isArray(wert) ? (wert as RepeaterRow[]) : []}
          onChange={onChange} gesperrt={g.disabled} umgebung={umgebung}
          uebersetzung={umgebung.zeilenUebersetzung?.(feld)}
        />
      )

    case 'media':
    case 'file':
      return (
        <Dateifeld
          id={g.id}
          tenantId={umgebung.tenantId}
          wert={typeof wert === 'string' && wert !== '' ? wert : null}
          nurDokumente={feld.type === 'file'}
          gesperrt={g.disabled}
          beschreibung={g['aria-describedby']}
          onChange={onChange}
        />
      )

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
 * Mehrfachauswahl mit optionaler Eigenergänzung.
 *
 * Die vorgegebene Liste ist bei Allergenen die gesetzliche -- sie bleibt
 * vollständig, kürzen wäre eine Lücke in der Deklaration. Was gefehlt hat, ist
 * der Platz für alles, was auf einer Karte steht und in keiner Verordnung:
 * „scharf", „vegan", „hausgemacht". Deshalb creatable am Feld statt einer
 * längeren festen Liste.
 *
 * Eigene Angaben stehen VOR der Vorschlagsliste: Was der Betrieb selbst
 * eingetragen hat, benutzt er wieder.
 */
function Mehrfachauswahl({
  feld, gewaehlt, onChange, g,
}: {
  feld: Field; gewaehlt: string[]; onChange: (w: unknown) => void; g: Gemeinsam
}) {
  const [neu, setNeu] = useState('')
  const vorschlaege = feld.config.options ?? []
  const eigene = gewaehlt.filter((w) => !vorschlaege.includes(w))

  const umschalten = (o: string) =>
    onChange(gewaehlt.includes(o) ? gewaehlt.filter((x) => x !== o) : [...gewaehlt, o])

  const ergaenzen = () => {
    const text = neu.trim()
    if (text === '' || gewaehlt.includes(text)) { setNeu(''); return }
    onChange([...gewaehlt, text])
    setNeu('')
  }

  return (
    <div className="stapel-eng">
      <div className="chips">
        {[...eigene, ...vorschlaege].map((o) => {
          const an = gewaehlt.includes(o)
          return (
            <button key={o} type="button" disabled={g.disabled} aria-pressed={an}
                    className={an ? 'chip chip-an' : 'chip'}
                    onClick={() => umschalten(o)}>
              {feld.config.option_labels?.[o] ?? o}
            </button>
          )
        })}
      </div>

      {feld.config.creatable && (
        <div className="zeile" style={{ gap: 8 }}>
          <input
            type="text"
            value={neu}
            disabled={g.disabled}
            placeholder="Eigene Angabe, z.B. scharf"
            maxLength={40}
            aria-label={`Eigene Angabe zu ${feld.label}`}
            onChange={(e) => setNeu(e.target.value)}
            // Enter im Formular würde sonst den ganzen Eintrag absenden.
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ergaenzen() } }}
          />
          <button type="button" className="knopf-zweit" disabled={g.disabled || neu.trim() === ''}
                  onClick={ergaenzen}>
            Hinzufügen
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Wiederholgruppe.
 *
 * EINE Karte pro Zeile, mit allen Feldern in der definierten Reihenfolge.
 *
 * Vorher standen die nicht übersetzbaren Felder (Preis, Allergene) und die
 * übersetzbaren (Gericht, Beschreibung) in zwei getrennten Blöcken
 * untereinander -- weil sie technisch verschieden gespeichert werden: die einen
 * an der Zeile, die anderen pro Sprache. Für die Wirtin bedeutete das fünf
 * Karten mit Preisen, darunter fünf Karten mit Gerichtsnamen, und der Preis von
 * „Salade verte" stand zwei Bildschirme entfernt von „Salade verte".
 *
 * Wie etwas gespeichert wird, ist kein Grund, es getrennt anzuzeigen. In einer
 * Übersetzung bleibt die Trennung sinnvoll -- dort werden Preise gar nicht
 * gezeigt --, in der Hauptsprache nicht.
 *
 * Sortiert wird mit Hoch/Runter-Knöpfen statt echtem Ziehen: Auf dem Handy ist
 * Drag & Drop in einer scrollenden Liste unzuverlässig, und Tastaturbedienung
 * bekommt man gratis dazu.
 */
export type ZeilenUebersetzung = {
  /** Übersetzbare Unterfelder, die MIT in die Zeilenkarte gehören. */
  felder: Field[]
  wert: (zeilenId: string, feldKey: string) => unknown
  setze: (zeilenId: string, feldKey: string, wert: unknown) => void
}

function Wiederholgruppe({
  feld, zeilen, onChange, gesperrt, umgebung, uebersetzung,
}: {
  feld: Field; zeilen: RepeaterRow[]; onChange: (w: unknown) => void
  gesperrt?: boolean; umgebung: Feldumgebung; uebersetzung?: ZeilenUebersetzung
}) {
  const eigene = feld.children.filter((k) => !k.translatable)
  // Reihenfolge wie definiert, nicht „erst technisch A, dann technisch B".
  const alle = [...eigene, ...(uebersetzung?.felder ?? [])].sort((a, b) => a.position - b.position)

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
          {alle.map((kind) => (
            kind.translatable && uebersetzung ? (
              <Feld key={kind.id} feld={kind} umgebung={umgebung} gesperrt={gesperrt}
                    wert={uebersetzung.wert(zeile._id, kind.key)}
                    onChange={(v) => uebersetzung.setze(zeile._id, kind.key, v)} />
            ) : (
              <Feld key={kind.id} feld={kind} wert={zeile[kind.key]} gesperrt={gesperrt}
                    umgebung={umgebung} onChange={(v) => setze(i, kind.key, v)} />
            )
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
