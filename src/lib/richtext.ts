import 'server-only'
import sanitizeHtml from 'sanitize-html'

/**
 * HTML aus einem Richtext-Feld säubern.
 *
 * WARUM DAS NÖTIG IST
 * -------------------
 * Der Richtext-Inhalt geht unverändert über die Lese-API auf die Kundenwebsite
 * und landet dort in aller Regel in `dangerouslySetInnerHTML` -- anders lässt
 * sich formatierter Text nicht ausliefern. Ohne Säuberung könnte jemand mit
 * einem Mandantenzugang `<script>` in einen Beitrag schreiben und damit Code auf
 * der Website des Kunden ausführen.
 *
 * Das ist ausdrücklich KEIN „der Kunde schadet sich selbst": Die Aushilfe, die
 * nur News pflegen darf, käme so an jede Besucherin der Firmenwebsite. Eine
 * eingegrenzte Berechtigung, mit der sich beliebiges Skript auf der Website
 * platzieren lässt, ist keine Eingrenzung.
 *
 * WARUM BEIM SPEICHERN UND NICHT BEIM AUSLIEFERN
 * ----------------------------------------------
 * Beim Speichern genau einmal, danach ist der gespeicherte Wert sauber. Beim
 * Ausliefern müsste jede Antwort erneut durch den Parser -- und die Lese-API ist
 * der eine Pfad, der schnell bleiben muss. Ausserdem sieht der Kunde im Editor
 * dann das, was tatsächlich auf seiner Website steht.
 *
 * WARUM EINE BIBLIOTHEK
 * ---------------------
 * HTML sicher zu säubern heisst, HTML richtig zu parsen. Eine selbst gebaute
 * Erlaubnisliste mit regulären Ausdrücken ist der Klassiker unter den Lücken --
 * verschachtelte Anführungszeichen, `<svg onload=…>`, `javascript:`-Adressen mit
 * Zeilenumbruch darin. Diese Arbeit macht man nicht selbst.
 */

/**
 * Was ein Kunde formatieren darf.
 *
 * Bewusst schmal: Absätze, Betonung, Listen, Links, Überschriften ab Ebene zwei.
 * Kein `style`, keine `class`, keine `id` -- das Aussehen bestimmt das Template
 * der Website, nicht der Text im CMS. Kein `<img>`: Bilder kommen über
 * Medienfelder, mit Alt-Text und in vernünftigen Breiten.
 */
const ERLAUBT: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
    'ul', 'ol', 'li', 'blockquote',
    'h2', 'h3', 'h4', 'a',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
  },
  // mailto und tel sind für ein KMU der halbe Zweck eines Links.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href'],
  // Fremde Ziele bekommen rel=noopener: Ohne das erhält die geöffnete Seite
  // über window.opener Zugriff auf die Kundenwebsite.
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href ?? ''
      const extern = /^https?:\/\//i.test(href)
      return {
        tagName: 'a',
        attribs: extern
          ? { ...attribs, target: '_blank', rel: 'noopener noreferrer' }
          : attribs,
      }
    },
  },
  disallowedTagsMode: 'discard',
}

export function saeubereRichtext(roh: unknown): string {
  if (typeof roh !== 'string' || roh.trim() === '') return ''
  return sanitizeHtml(roh, ERLAUBT)
}

/**
 * Alle Richtext-Felder eines Wertesatzes säubern, auch in Wiederholzeilen.
 *
 * Geht über die Felddefinition und nicht über „was sieht nach HTML aus": Was
 * gesäubert wird, entscheidet der Feldtyp. Ein Textfeld, in dem zufällig spitze
 * Klammern stehen, bleibt unangetastet -- dort ist HTML ohnehin nur Text.
 */
export function saeubereRichtextWerte(
  felder: { key: string; type: string; children?: { key: string; type: string }[] }[],
  werte: Record<string, unknown>,
): Record<string, unknown> {
  const kopie: Record<string, unknown> = { ...werte }

  for (const feld of felder) {
    if (feld.type === 'richtext' && feld.key in kopie) {
      kopie[feld.key] = saeubereRichtext(kopie[feld.key])
      continue
    }

    // Wiederholgruppe: in der Hauptsprache ein Array von Zeilen, in einer
    // Übersetzung ein Objekt, das nach Zeilen-ID schlüsselt.
    const kinder = (feld.children ?? []).filter((k) => k.type === 'richtext')
    if (kinder.length === 0) continue
    const wert = kopie[feld.key]

    if (Array.isArray(wert)) {
      kopie[feld.key] = wert.map((zeile) =>
        zeile && typeof zeile === 'object'
          ? Object.fromEntries(Object.entries(zeile as Record<string, unknown>).map(
              ([k, v]) => [k, kinder.some((kk) => kk.key === k) ? saeubereRichtext(v) : v]))
          : zeile)
    } else if (wert && typeof wert === 'object') {
      kopie[feld.key] = Object.fromEntries(
        Object.entries(wert as Record<string, unknown>).map(([zeilenId, zeile]) => [
          zeilenId,
          zeile && typeof zeile === 'object'
            ? Object.fromEntries(Object.entries(zeile as Record<string, unknown>).map(
                ([k, v]) => [k, kinder.some((kk) => kk.key === k) ? saeubereRichtext(v) : v]))
            : zeile,
        ]))
    }
  }

  return kopie
}
