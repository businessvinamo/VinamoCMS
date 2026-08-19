'use client'

import { useState } from 'react'
import { alsFeldtext, formatiereBetrag, leseBetrag } from '@/lib/preis'

type Eigenschaften = {
  id: string
  wert: unknown
  waehrung: string
  disabled?: boolean
  'aria-describedby'?: string
  onChange: (wert: unknown) => void
}

/**
 * Eingabefeld für einen Preis.
 *
 * ZWEI ZUSTÄNDE, MIT ABSICHT
 * --------------------------
 * Im Feld steht Text, gespeichert wird eine Zahl. Ohne diese Trennung liesse
 * sich „10." nicht tippen: Der Zwischenschritt ist keine gültige Zahl, würde
 * sofort zurückgeschrieben und der Punkt verschwände unter den Fingern.
 *
 * Formatiert wird beim VERLASSEN des Feldes, nicht beim Tippen. Wer „1" tippt,
 * um „12.50" zu schreiben, soll nicht nach dem ersten Zeichen „1.00" vorfinden
 * und den Rest daneben tippen.
 *
 * KEIN ABGLEICH MIT DEM WERT VON AUSSEN
 * -------------------------------------
 * Bewusst kein useEffect, der den Text nachführt: Der Entwurf ändert Preise
 * nicht hinter dem Rücken des Kunden, und ein solcher Abgleich würde beim
 * Tippen gegen die Eingabe arbeiten. Wird eine Version wiederhergestellt, lädt
 * die Seite ohnehin neu und das Feld beginnt von vorn.
 */
export function Preisfeld({
  id, wert, waehrung, disabled, onChange, ...rest
}: Eigenschaften) {
  const [text, setText] = useState(() => alsFeldtext(wert))

  function beiEingabe(roh: string) {
    setText(roh)
    const gelesen = leseBetrag(roh)
    // Ungültiges wird als Text weitergereicht, damit die Prüfung beim Speichern
    // es meldet -- verschluckt man es hier, speichert der Kunde ein leeres Feld
    // und merkt es nie.
    if (gelesen.art === 'leer') onChange(null)
    else if (gelesen.art === 'zahl') onChange(gelesen.wert)
    else onChange(roh)
  }

  function beiVerlassen() {
    const gelesen = leseBetrag(text)
    if (gelesen.art === 'leer') {
      setText('')
      onChange(null)
      return
    }
    // Ungültiges bleibt stehen, wie es getippt wurde. „X" zu „0.00" zu machen
    // wäre schlimmer als der Fehler selbst.
    if (gelesen.art === 'ungueltig') return

    setText(formatiereBetrag(gelesen.wert))
    onChange(gelesen.wert)
  }

  return (
    <span className="preisfeld">
      <input
        {...rest}
        id={id}
        disabled={disabled}
        type="text"
        inputMode="decimal"
        placeholder="24.50"
        value={text}
        onChange={(e) => beiEingabe(e.target.value)}
        onBlur={beiVerlassen}
      />
      <span className="leise waehrung">{waehrung}</span>
    </span>
  )
}
