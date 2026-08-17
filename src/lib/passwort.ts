/**
 * Passwortregeln.
 *
 * Bewusst nur eine Längenvorgabe und eine Sperrliste, keine Zeichenklassen.
 * Erzwungene Sonderzeichen erzeugen nachweislich "Passwort1!" -- also ein
 * schlechteres Passwort als eine lange Wortfolge. Länge ist der Faktor, der
 * tatsächlich zählt.
 */

export const MIN_LAENGE = 10

/** Was Leute tatsächlich eintippen, wenn man sie lässt. */
const ZU_NAHELIEGEND = [
  'passwort', 'password', '12345678', 'qwertz', 'qwerty', 'vinamo',
  'admin', 'restaurant', 'schweiz', 'sommer', 'winter', 'willkommen',
]

export function pruefePasswort(passwort: string, email?: string): string | null {
  if (passwort.length < MIN_LAENGE) {
    return `Das Passwort braucht mindestens ${MIN_LAENGE} Zeichen. Ein kurzer Satz funktioniert gut.`
  }
  if (passwort.length > 200) {
    return 'Das Passwort ist zu lang.'
  }

  const klein = passwort.toLowerCase()
  for (const wort of ZU_NAHELIEGEND) {
    if (klein.includes(wort)) {
      return 'Dieses Passwort ist zu leicht zu erraten. Bitte etwas anderes wählen.'
    }
  }

  const name = email?.split('@')[0]?.toLowerCase()
  if (name && name.length >= 4 && klein.includes(name)) {
    return 'Das Passwort darf nicht deine E-Mail-Adresse enthalten.'
  }

  return null
}
