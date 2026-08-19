/**
 * Preiseingaben lesen und darstellen.
 *
 * WARUM EIN EIGENES MODUL
 * -----------------------
 * Die Regeln stecken sonst im Eingabefeld und lassen sich nur mit einem Browser
 * prüfen. Hier sind sie reine Funktionen -- und damit prüfbar, ohne etwas zu
 * starten.
 *
 * WAS GESPEICHERT WIRD
 * --------------------
 * Eine ZAHL, nie eine Zeichenkette. „10.00" ist eine Darstellung, kein Wert.
 * Die Lese-API sagt zu, dass `price` eine Zahl ist; die Kundenwebsite rechnet
 * damit und formatiert selbst. Würde hier „10.00" gespeichert, bräche jede
 * Website, die `price.toFixed(2)` aufruft.
 *
 * Der Kunde sieht trotzdem „10.00", sobald er das Feld verlässt -- das ist
 * Sache der Anzeige, nicht der Daten.
 */

export const NACHKOMMASTELLEN = 2

export type Betrag =
  | { art: 'leer' }
  | { art: 'zahl'; wert: number }
  | { art: 'ungueltig' }

/**
 * Was zwischen Ziffern stehen darf, ohne etwas zu bedeuten: das Schweizer
 * Tausender-Apostroph und jede Art von Leerzeichen. „1'250.50" ist eine
 * Schreibweise, die ein Wirt tatsächlich eintippt.
 */
const TAUSENDERZEICHEN = /['’\s ]/g

/**
 * Eine Eingabe deuten.
 *
 * Das Komma ist Dezimaltrennzeichen, nicht Tausendertrennzeichen: Wer „10,50"
 * tippt, meint zehn Franken fünfzig. Die englische Schreibweise „10,500" für
 * zehneinhalbtausend kommt auf einer Speisekarte nicht vor.
 *
 * Negative Beträge gelten als ungültig. Ein Gericht kostet nichts Negatives --
 * ein Minus ist ein Vertipper, und ihn stillschweigend zu speichern wäre
 * schlimmer, als ihn zu melden.
 */
export function leseBetrag(roh: string): Betrag {
  const bereinigt = roh.replace(TAUSENDERZEICHEN, '').replace(',', '.')
  if (bereinigt === '') return { art: 'leer' }

  const zahl = Number(bereinigt)
  if (!Number.isFinite(zahl) || zahl < 0) return { art: 'ungueltig' }

  return { art: 'zahl', wert: runde(zahl) }
}

/** Auf zwei Nachkommastellen runden, ohne Fliesskomma-Reste wie 10.229999. */
function runde(zahl: number): number {
  return Number(zahl.toFixed(NACHKOMMASTELLEN))
}

/** Wie der Betrag im Feld steht, sobald der Kunde es verlässt: „10.00". */
export function formatiereBetrag(wert: number): string {
  return wert.toFixed(NACHKOMMASTELLEN)
}

/**
 * Startwert für das Eingabefeld. Zahlen kommen formatiert, alles andere
 * unverändert -- eine ungültige Eingabe aus einem früheren Entwurf soll
 * sichtbar bleiben und nicht heimlich verschwinden.
 */
export function alsFeldtext(wert: unknown): string {
  if (wert === null || wert === undefined) return ''
  if (typeof wert === 'number' && Number.isFinite(wert)) return formatiereBetrag(wert)
  return String(wert)
}
