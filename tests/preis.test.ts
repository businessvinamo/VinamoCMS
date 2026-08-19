import { describe, expect, test } from 'vitest'
import { alsFeldtext, formatiereBetrag, leseBetrag } from '../src/lib/preis'

describe('leseBetrag', () => {
  test('macht aus einer ganzen Zahl einen Betrag', () => {
    expect(leseBetrag('10')).toEqual({ art: 'zahl', wert: 10 })
  })

  test('nimmt das Komma als Dezimaltrennzeichen', () => {
    expect(leseBetrag('10,50')).toEqual({ art: 'zahl', wert: 10.5 })
  })

  test('nimmt auch den Punkt', () => {
    expect(leseBetrag('10.50')).toEqual({ art: 'zahl', wert: 10.5 })
  })

  test('überliest das Schweizer Tausender-Apostroph', () => {
    expect(leseBetrag("1'250.50")).toEqual({ art: 'zahl', wert: 1250.5 })
  })

  test('überliest Leerzeichen, auch geschützte', () => {
    expect(leseBetrag('1 250.50')).toEqual({ art: 'zahl', wert: 1250.5 })
    expect(leseBetrag(' 1 250,50 ')).toEqual({ art: 'zahl', wert: 1250.5 })
  })

  test('rundet auf zwei Nachkommastellen', () => {
    expect(leseBetrag('10.999')).toEqual({ art: 'zahl', wert: 11 })
    expect(leseBetrag('10.994')).toEqual({ art: 'zahl', wert: 10.99 })
  })

  test('erzeugt keine Fliesskomma-Reste', () => {
    // 8.115 * 1 ergibt in Fliesskomma 8.114999…; das darf nicht durchschlagen.
    const gelesen = leseBetrag('8.115')
    expect(gelesen).toEqual({ art: 'zahl', wert: 8.12 })
    expect(String((gelesen as { wert: number }).wert)).toBe('8.12')
  })

  test('meldet eine leere Eingabe als leer, nicht als null-Betrag', () => {
    expect(leseBetrag('')).toEqual({ art: 'leer' })
    expect(leseBetrag('   ')).toEqual({ art: 'leer' })
  })

  test('weist Buchstaben zurück', () => {
    expect(leseBetrag('X')).toEqual({ art: 'ungueltig' })
    expect(leseBetrag('10 Franken')).toEqual({ art: 'ungueltig' })
  })

  test('weist negative Beträge zurück', () => {
    expect(leseBetrag('-5')).toEqual({ art: 'ungueltig' })
  })

  test('weist Unendlich zurück', () => {
    expect(leseBetrag('Infinity')).toEqual({ art: 'ungueltig' })
  })
})

describe('formatiereBetrag', () => {
  test('ergänzt fehlende Nachkommastellen', () => {
    expect(formatiereBetrag(10)).toBe('10.00')
    expect(formatiereBetrag(10.5)).toBe('10.50')
  })

  test('lässt zwei Nachkommastellen unverändert', () => {
    expect(formatiereBetrag(24.55)).toBe('24.55')
  })

  test('formatiert die Null als Betrag, nicht als Leere', () => {
    expect(formatiereBetrag(0)).toBe('0.00')
  })
})

describe('alsFeldtext', () => {
  test('zeigt eine gespeicherte Zahl formatiert', () => {
    expect(alsFeldtext(10)).toBe('10.00')
  })

  test('zeigt die Null und nicht ein leeres Feld', () => {
    expect(alsFeldtext(0)).toBe('0.00')
  })

  test('macht aus fehlendem Wert ein leeres Feld', () => {
    expect(alsFeldtext(null)).toBe('')
    expect(alsFeldtext(undefined)).toBe('')
  })

  test('lässt eine ungültige Alteingabe stehen, statt sie zu verstecken', () => {
    expect(alsFeldtext('auf Anfrage')).toBe('auf Anfrage')
  })
})
