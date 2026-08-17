# Inhalte auf einer Website einbinden

Die Lese-API ist öffentlich und braucht keinen Schlüssel. Sie liefert
ausschliesslich **veröffentlichte und zum Abrufzeitpunkt gültige** Inhalte —
Entwürfe, abgelaufene Aktionen und noch nicht gestartete Saisonkarten sind nicht
enthalten. Die Website muss nie selbst prüfen, ob etwas gilt.

```
GET https://admin.vinamo.ch/api/v1/<mandant>/<sprache>/<inhaltstyp>
```

| Teil | Beispiel | Woher |
| --- | --- | --- |
| `mandant` | `restaurant-sonne` | Kennung des Mandanten im Admin |
| `sprache` | `de` `fr` `it` `en` | eine der aktivierten Sprachen |
| `inhaltstyp` | `news` `menu_section` `team` `services` `opening_hours` | im Admin sichtbar |

---

## Was zurückkommt

```json
{
  "tenant": "vinamo-test",
  "type": "menu_section",
  "kind": "collection",
  "locale": "fr",
  "fallback_locale": "de",
  "generated_at": "2026-08-17T20:30:00Z",
  "next_change_at": "2026-08-18T15:46:06Z",
  "items": [
    {
      "id": "2ad5b36c-…",
      "slot": "vorspeisen",
      "slug": null,
      "values": {
        "name": "Entrees",
        "dishes": [
          { "_id": "4d66…", "dish": "Salade verte",      "price": 9,    "allergens": [] },
          { "_id": "a26e…", "dish": "Soupe de tomates",  "price": 12.5, "allergens": ["Milch"] }
        ]
      }
    }
  ]
}
```

Drei Dinge, die dir Arbeit abnehmen:

**Übersetzungen sind schon zusammengeführt.** Fehlt ein französischer Text, steht
im Feld automatisch der deutsche. Du bekommst nie ein leeres Feld, weil jemand
die Übersetzung vergessen hat.

**Wiederholgruppen sind Arrays in der richtigen Reihenfolge**, und jede Zeile
trägt ihre nicht übersetzbaren Werte mit — Preis und Allergene stehen an
derselben Zeile wie der übersetzte Gerichtsname. Das `_id` eignet sich als
stabiler Schlüssel beim Rendern.

**`next_change_at`** sagt, wann sich der Inhalt das nächste Mal ändert — etwa
wenn eine Saisonkarte startet oder eine Aktion ausläuft. `null` heisst: nichts
geplant.

---

## Variante A · Statische Website, beliebige Technik

Beim Bauen einmal abrufen und ins HTML schreiben. Beispiel mit `curl` und `jq`
in einem Build-Skript:

```bash
curl -s "https://admin.vinamo.ch/api/v1/restaurant-sonne/de/menu_section" \
  > inhalte/speisekarte.json
```

Oder direkt im Browser nachladen — für eine reine HTML-Seite ohne Build:

```html
<div id="speisekarte">Wird geladen …</div>

<script type="module">
  const mandant = 'restaurant-sonne'
  const sprache = document.documentElement.lang || 'de'

  const antwort = await fetch(
    `https://admin.vinamo.ch/api/v1/${mandant}/${sprache}/menu_section`,
  )
  if (!antwort.ok) throw new Error('Speisekarte nicht verfügbar')
  const { items } = await antwort.json()

  document.querySelector('#speisekarte').innerHTML = items.map((abschnitt) => `
    <section>
      <h2>${abschnitt.values.name}</h2>
      <ul>
        ${(abschnitt.values.dishes ?? []).map((g) => `
          <li>
            <strong>${g.dish}</strong>
            ${g.description ? `<p>${g.description}</p>` : ''}
            ${g.price != null ? `<span>${g.price.toFixed(2)}</span>` : ''}
            ${g.allergens?.length ? `<small>${g.allergens.join(', ')}</small>` : ''}
          </li>`).join('')}
      </ul>
    </section>`).join('')
</script>
```

Das Nachladen im Browser ist der einfachste Weg, hat aber zwei Nachteile: Die
Inhalte stehen nicht im HTML und werden von Suchmaschinen schlechter erfasst,
und die Seite hängt bei jedem Aufruf am Admin. Für eine Speisekarte, die
gefunden werden soll, ist Variante B besser.

> **Achtung bei `innerHTML`:** Im Beispiel oben landen Kundeninhalte direkt im
> HTML. Solange nur ihr selbst und eure Kunden Inhalte pflegen, ist das
> vertretbar. Sauberer ist `textContent` pro Element — oder ein Framework, das
> ohnehin escapet.

---

## Variante B · Next.js, beim Bauen geholt (empfohlen)

Die Inhalte stehen im ausgelieferten HTML, die Seite bleibt online, auch wenn
das Admin gerade nicht erreichbar ist.

```ts
// lib/vinamo.ts
const ADMIN = 'https://admin.vinamo.ch'
const MANDANT = process.env.VINAMO_TENANT!

export async function holeInhalte(typ: string, sprache = 'de') {
  const antwort = await fetch(`${ADMIN}/api/v1/${MANDANT}/${sprache}/${typ}`, {
    // Der Webhook stösst den Rebuild an, deshalb darf hier lange gecacht werden.
    next: { revalidate: 3600, tags: [`vinamo:${typ}`] },
  })
  if (!antwort.ok) throw new Error(`${typ} nicht verfügbar (${antwort.status})`)
  return antwort.json()
}
```

```tsx
// app/[sprache]/speisekarte/page.tsx
import { holeInhalte } from '@/lib/vinamo'

export default async function Speisekarte({
  params,
}: { params: Promise<{ sprache: string }> }) {
  const { sprache } = await params
  const { items } = await holeInhalte('menu_section', sprache)

  return (
    <>
      {items.map((abschnitt) => (
        <section key={abschnitt.id}>
          <h2>{abschnitt.values.name}</h2>
          <ul>
            {(abschnitt.values.dishes ?? []).map((g) => (
              <li key={g._id}>
                <strong>{g.dish}</strong>
                {g.description && <p>{g.description}</p>}
                {g.price != null && <span>{g.price.toFixed(2)}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}
```

`VINAMO_TENANT` als Umgebungsvariable pro Kundenseite setzen — dieselbe
Codebasis bedient damit jeden Kunden.

---

## Bilder

Medienfelder liefern die Kennung des Bildes. Die Varianten stehen im
Medien-Datensatz und lassen sich als `srcset` verwenden:

```html
<img
  src="https://<projekt>.supabase.co/storage/v1/object/public/media/<pfad>-800.webp"
  srcset="…-400.webp 400w, …-800.webp 800w, …-1200.webp 1200w, …-1600.webp 1600w"
  sizes="(max-width: 700px) 100vw, 700px"
  alt="…"
  loading="lazy"
/>
```

Die Bilder liegen bereits als WebP in vier Breiten vor, EXIF-Daten inklusive
GPS-Position sind entfernt. Alt-Texte sind übersetzbar und kommen in der
angefragten Sprache.

---

## Automatisch aktualisieren

Damit die Kundenseite beim Veröffentlichen neu gebaut wird, braucht der Mandant
einen Webhook auf die Deploy-Adresse der Seite. Der Aufruf ist signiert:

```
POST <deine-webhook-adresse>
X-Vinamo-Event: entry.published
X-Vinamo-Signature: sha256=<HMAC-SHA256 über den Rumpf>
```

Gegenprüfung auf Empfängerseite — die Funktion liegt als
`pruefeSignatur()` in `src/lib/webhooks.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

export function pruefeSignatur(koerper: string, signatur: string, geheimnis: string) {
  const erwartet = `sha256=${createHmac('sha256', geheimnis).update(koerper).digest('hex')}`
  const a = Buffer.from(erwartet)
  const b = Buffer.from(signatur)
  return a.length === b.length && timingSafeEqual(a, b)
}
```

Fehlgeschlagene Zustellungen werden bis zu sechsmal wiederholt (nach 1 min,
5 min, 15 min, 1 h, 6 h, 24 h) und stehen für den Kunden sichtbar unter
`/t/<mandant>/protokoll`.

Zusätzlich prüft der Zeitplan-Job jede Minute, ob eine gesetzte Zeitgrenze
überschritten wurde, und stösst dann ebenfalls einen Rebuild an — so wird die
Saisonkarte auch dann pünktlich sichtbar, wenn niemand etwas veröffentlicht hat.

---

## Zwischenspeicher

Antworten tragen ein `ETag`; mit `If-None-Match` bekommst du `304` statt der
vollen Antwort. Die Cache-Dauer endet automatisch an der nächsten Zeitgrenze —
eine Mittagskarte, die um 11:00 gültig wird, erscheint deshalb um 11:00 und
nicht irgendwann danach.

Du musst dafür nichts tun. Wichtig ist nur: **keine eigene, längere Cache-Dauer
davorschalten**, sonst hebelst du genau diese Mechanik aus.

---

## Vorschau eines künftigen Zeitpunkts

```
GET /api/v1/<mandant>/<sprache>/<typ>?at=2026-12-24T18:00:00Z&token=<PREVIEW_TOKEN>
```

Zeigt, was zu diesem Zeitpunkt auf der Seite stehen wird. Ohne gültiges Token
wird der Parameter abgelehnt — sonst könnte jeder vorbereitete Aktionen und
künftige Preise abrufen.
