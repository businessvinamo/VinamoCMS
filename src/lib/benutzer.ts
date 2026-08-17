import 'server-only'
import { randomInt } from 'node:crypto'

/**
 * Startpasswort erzeugen.
 *
 * Alphabet ohne verwechselbare Zeichen: keine 0/O, keine 1/l/I. Der Kunde tippt
 * das vom Handy ab, und "war das eine Null oder ein O" ist ein Support-Anruf.
 *
 * Gruppen zu vier Zeichen, weil das abschreiben und diktieren erleichtert.
 * 20 Zeichen aus 32 Zeichen sind rund 100 Bit -- das Startpasswort ist damit
 * eher stärker als das, was der Kunde sich danach selbst ausdenkt.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export function erzeugeStartpasswort(): string {
  const gruppen: string[] = []
  for (let g = 0; g < 5; g++) {
    let gruppe = ''
    for (let i = 0; i < 4; i++) {
      gruppe += ALPHABET[randomInt(ALPHABET.length)]
    }
    gruppen.push(gruppe)
  }
  return gruppen.join('-')
}
