# Prompt für die Testwebsite

Zum Kopieren in eine neue Claude-Code-Sitzung in einem **leeren** Verzeichnis.
Er baut eine Kundenwebsite, die alle Inhaltstypen von VinamoCMS abruft und
darstellt — also genau das, was ein Website-Bauer später tut.

Die Testdaten liegen bereit: Der Mandant `vinamo-test` ist als **Restaurant
Sonnenberg** gefüllt, alles veröffentlicht, mit Bildern und einem PDF. Es muss
nichts mehr im Admin angelegt werden.

---

## Der Prompt

````text
Bau mir eine Testwebsite für ein Restaurant, die ihre Inhalte aus einem CMS
holt. Next.js 15 mit App Router und TypeScript, keine Datenbank, kein
Authentifizierungs-Teil — alles kommt aus einer öffentlichen Lese-API.

## Die API

    GET https://admin.vinamo.ch/api/v1/vinamo-test/<sprache>/<inhaltstyp>

Sprachen: de (Hauptsprache), fr
Kein Schlüssel nötig, CORS ist offen. Die Antwort enthält nur veröffentlichte
und zum Abrufzeitpunkt gültige Inhalte — die Website muss NIE selbst prüfen, ob
etwas gilt.

Antwortform:

```json
{
  "tenant": "vinamo-test",
  "type": "news",
  "kind": "collection",
  "locale": "de",
  "fallback_locale": "de",
  "generated_at": "2026-08-19T09:00:00Z",
  "next_change_at": null,
  "items": [
    { "id": "…", "slug": "sommerkarte", "slot": null, "values": { … } }
  ]
}
```

`values` enthält die Felder des Inhaltstyps. Übersetzungen sind bereits mit der
Hauptsprache verschmolzen — ein Feld ist nie leer, weil jemand die Übersetzung
vergessen hat. Das gilt bis auf die Zeile genau: In der französischen
Speisekarte steht „Salade mêlée" neben „Suppe des Tages", weil nur das eine
übersetzt ist.

## Die sieben Inhaltstypen

**menu_section** — ein Eintrag pro Abschnitt der Karte (Vorspeisen, …)
  name (Text), note (Text), dishes (Array):
    { _id, dish, description, price (Zahl oder null), allergens (Array Text) }
  `_id` als React-Key nutzen. Preis ist eine Zahl ohne Währung; der Betrieb
  rechnet in CHF. „Suppe des Tages" hat bewusst keinen Preis.
  Unter allergens stehen auch eigene Angaben wie „vegetarisch" oder „vegan" —
  keine feste Liste annehmen.

**menu_document** — die Karte als PDF, für Betriebe, die nicht jedes Gericht
  einzeln erfassen wollen
  title (Text), document (Datei-Objekt, siehe unten), note (Text)

**news** — Neuigkeiten
  title, lead, body (HTML), published_on (Datum), image (Bild-Objekt oder
  null), highlight (true/false)
  `highlight` heisst: auf der Startseite hervorheben.
  `body` ist HTML und wird serverseitig beim Speichern gesäubert — erlaubt sind
  nur p, br, strong, b, em, i, u, s, ul, ol, li, blockquote, h2–h4 und a, ohne
  style und ohne class. Du kannst es direkt rendern.

**opening_hours** — die regulären Zeiten, ein Eintrag
  label, note, hours (Array): { _id, day, from ("11:30"), to, closed }
  `day` ist ein sprachneutraler Schlüssel: mon, tue, wed, thu, fri, sat, sun.
  Die Beschriftung liefert deine Website — in der API steht bewusst kein
  deutsches Wort, das du übersetzen müsstest.
  Mehrere Zeilen pro Tag (Mittag und Abend) sind der Normalfall. Bei
  `closed: true` sind from/to null.

**opening_exceptions** — Ferien und besondere Tage
  label, from (Datum), to (Datum), closed (true/false), note,
  hours (Array): { _id, from, to } — NUR diese drei Felder, kein day und kein
  closed. Eine Ausnahme gilt für ihren ganzen Zeitraum; ein Wochentag ergäbe
  dort keinen Sinn.
  WICHTIG: Diese Einträge sind IMMER sichtbar, auch lange vor ihrem Zeitraum.
  Die Website entscheidet selbst, was sie ankündigt („Vom 2. bis 16. September
  geschlossen") und was sie heute anwendet. Bei einem einzelnen Tag sind from
  und to gleich. Ist closed false, gelten an diesen Tagen die Zeiten aus hours
  statt der regulären.

**services** — Leistungen
  title, description, price_from (Zahl oder null), image (Bild-Objekt oder null)
  price_from null heisst „auf Anfrage".

**team** — Team
  name, role, bio, group (Text oder fehlend), photo (Bild-Objekt oder null)
  Nach `group` gruppieren; wer keine Gruppe hat, kommt zuletzt. `group` wird
  NICHT übersetzt — es ist eine Zuordnung, kein Text für den Gast. In jeder
  Sprache steht derselbe Wert („Küche"), damit die Gruppierung stabil bleibt.
  Willst du französische Bereichsnamen, bilde sie auf der Website ab, so wie
  die Wochentage auch.
  Die Reihenfolge innerhalb einer Gruppe ist die aus der API — nicht
  umsortieren, sie ist im CMS von Hand gesetzt.

## Bild- und Dateifelder

Kommen als Objekt, nicht als Kennung:

```json
"image": {
  "id": "…",
  "url": "https://….supabase.co/storage/v1/object/public/media/…-1600.webp",
  "srcset": "https://…-400.webp 400w, https://…-800.webp 800w, …",
  "vorschau_url": "https://…-400.webp",
  "alt": "Terrasse des Restaurants im Abendlicht",
  "width": 1600, "height": 900, "mime": "image/webp", "bytes": 4622
}
```

Bilder liegen als WebP in bis zu vier Breiten vor — nutze `srcset` mit einem
passenden `sizes`. Der `alt` ist gepflegt und übersetzt; nimm ihn, erfinde
keinen.

Bei einem PDF ist `srcset` null und `width`/`height` sind null. Dort nur einen
Link oder eine Einbettung anbieten, kein `<img>`.

Ist nichts gesetzt, ist das Feld `null`.

## Seiten

/                 Startseite: hervorgehobene Neuigkeit, „heute geöffnet von…",
                  Hinweis auf laufende oder bevorstehende Ferien
/speisekarte      Abschnitte mit Gerichten, Preisen, Allergenen; darunter die
                  PDF-Karte als Download
/news             Liste, hervorgehobene zuoberst, dann nach Datum
/news/[slug]      Einzelne Neuigkeit (slug kommt aus der API)
/leistungen
/team             Nach Bereich gruppiert
/oeffnungszeiten  Reguläre Zeiten plus Ferien und besondere Tage

Sprachumschalter de/fr, Sprache in der Adresse: /fr/speisekarte

## Abrufen

Beim Bauen holen, nicht im Browser:

```ts
const antwort = await fetch(url, { next: { revalidate: 3600 } })
```

Setz KEINE eigene, längere Cache-Dauer davor — die API steuert sie über
`next_change_at` selbst.

## Was ich sehen will

Keine Design-Show, sondern ob die Daten tragen: schlichtes, sauberes Layout,
lesbar auf dem Handy. Wichtiger ist, dass jeder Sonderfall stimmt — sie sind
alle in den Testdaten enthalten:

- Wochentage als Schlüssel (mon…sun), nicht als Wörter
- „Suppe des Tages" ohne Preis
- Allergen „vegetarisch" und „vegan", die in keiner Standardliste stehen
- zwei Neuigkeiten ohne Bild
- „Apéro-Service" ohne Preis
- Tim Roth ohne Bereich
- Montag als Ruhetag (closed, ohne Zeiten)
- Dienstag bis Freitag mit zwei Zeitfenstern pro Tag
- Betriebsferien, die erst in zwei Wochen beginnen
- „Bundesfeier" als einzelner Tag
- „Herbstmarkt": offen, aber mit abweichenden Zeiten
- auf Französisch: Desserts gar nicht übersetzt, Hauptgänge nur teilweise —
  der Fallback greift pro Feld und pro Gericht
- das Team bleibt auf Französisch trotzdem in zwei Bereichen (nicht drei):
  `group` ist bewusst einsprachig

Bau das, starte es und zeig mir Screenshots der Seiten.
````

---

## Was in den Testdaten steht

Mandant `vinamo-test`, Anzeigename **Restaurant Sonnenberg**, Sprachen de/fr,
Währung CHF. Alle 17 Einträge sind veröffentlicht.

| Typ | Inhalt |
| --- | --- |
| Speisekarte | Vorspeisen (3), Hauptgänge (3), Desserts (2) |
| Karte als PDF | „Wochenkarte KW 34", echtes PDF |
| Neuigkeiten | Sommerkarte (hervorgehoben, mit Bild), Stelleninserat, Sommerfest |
| Reguläre Zeiten | Mo Ruhetag, Di–Fr Mittag und Abend, Sa Abend, So Mittag |
| Ferien | Betriebsferien, Bundesfeier, Herbstmarkt |
| Leistungen | Bankett (ab 65, mit Bild), Apéro-Service (ohne Preis) |
| Team | Küche (2), Service (1), einer ohne Bereich |

Was **nicht** in den Testdaten steckt, weil es die Website unnötig verwirrt
hätte: **Plätze und Rangzahlen** (`slot`, `priority`). Damit lässt sich „die
Saisonkarte schlägt die Regelkarte am selben Platz" abbilden — die API liefert
dann nur den Eintrag mit der höheren Rangzahl aus. Wer das prüfen will, legt im
Admin zwei Abschnitte mit demselben Platz und verschiedenen Rangzahlen an.

Alle Einträge sind unter dem Konto `kevin.heutschi@vinamo.ch` veröffentlicht —
im Protokoll steht deshalb dein Name.
