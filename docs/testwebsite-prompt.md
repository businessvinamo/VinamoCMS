# Prompt für die Testwebsite

Zum Kopieren in eine neue Claude-Code-Sitzung in einem **leeren** Verzeichnis.
Er baut eine Kundenwebsite, die alle Inhaltstypen von VinamoCMS abruft und
darstellt — also genau das, was ein Website-Bauer später tut.

---

## Der Prompt

````text
Bau mir eine Testwebsite für ein Restaurant, die ihre Inhalte aus einem CMS
holt. Next.js 15 mit App Router und TypeScript, keine Datenbank, kein
Authentifizierungs-Teil — alles kommt aus einer öffentlichen Lese-API.

## Die API

    GET https://admin.vinamo.ch/api/v1/<mandant>/<sprache>/<inhaltstyp>

Mandant: vinamo-test
Sprachen: de, fr, it, en
Kein Schlüssel nötig. Die Antwort enthält nur veröffentlichte und zum
Abrufzeitpunkt gültige Inhalte — die Website muss NIE selbst prüfen, ob etwas
gilt oder ob ein Datum schon erreicht ist.

Antwortform:

```json
{
  "tenant": "vinamo-test",
  "type": "news",
  "kind": "collection",
  "locale": "de",
  "fallback_locale": "de",
  "generated_at": "2026-08-18T09:00:00Z",
  "next_change_at": "2026-08-19T11:00:00Z",
  "items": [
    { "id": "…", "slug": "sommerfest", "slot": null, "values": { … } }
  ]
}
```

`values` enthält die Felder des Inhaltstyps. Übersetzungen sind bereits mit der
Hauptsprache verschmolzen — ein Feld ist nie leer, weil jemand die Übersetzung
vergessen hat. `next_change_at` sagt, wann sich der Inhalt das nächste Mal
ändert (`null` = nichts geplant).

## Die sieben Inhaltstypen

**menu_section** — Speisekarte, ein Eintrag pro Abschnitt
  name (Text), note (Text), dishes (Array):
    { _id, dish, description, price (Zahl), allergens (Array von Text) }
  Nutze `_id` als React-Key. Der Preis ist eine Zahl ohne Währung — die
  Währung des Betriebs steht nicht in dieser Antwort, nimm CHF.

**menu_document** — Karte als PDF
  title (Text), document (Datei-Objekt, siehe unten), note (Text)

**news** — Neuigkeiten
  title, lead, body (HTML-ähnlicher Text), published_on (Datum),
  image (Bild-Objekt), highlight (true/false)
  `highlight` heisst: auf der Startseite hervorheben.

**opening_hours** — Öffnungszeiten
  label, note, hours (Array): { _id, day, from ("09:00"), to, closed }
  `day` ist Montag…Sonntag. Mehrere Zeilen pro Tag sind möglich
  (Mittag und Abend).

**opening_exceptions** — Ferien und besondere Tage
  label, from (Datum), to (Datum), closed (true/false), note,
  hours (Array wie oben, für abweichende Zeiten)
  WICHTIG: Diese Einträge sind IMMER sichtbar, auch vor ihrem Zeitraum. Die
  Website entscheidet selbst, was sie ankündigt („Vom 20.7. bis 4.8.
  geschlossen") und was sie heute anwendet.

**services** — Leistungen
  title, description, price_from (Zahl), image (Bild-Objekt)

**team** — Team
  name, role, bio, group (Text, optional), photo (Bild-Objekt)
  Gruppiere nach `group`; Einträge ohne Gruppe kommen zuletzt. Die
  Reihenfolge innerhalb einer Gruppe ist die aus der API — nicht umsortieren.

## Bild- und Dateifelder

Kommen als Objekt, nicht als Kennung:

```json
"image": {
  "id": "…", "url": "https://…-1600.webp",
  "srcset": "https://…-400.webp 400w, https://…-800.webp 800w",
  "alt": "Terrasse im Sommer", "width": 1600, "height": 900,
  "mime": "image/webp"
}
```

Bei einem PDF fehlt `srcset` und `width`/`height` sind null — dort nur einen
Link anbieten. Ist kein Bild gesetzt, ist das Feld `null`.

## Seiten

/                 Startseite: hervorgehobene News, Öffnungszeiten heute,
                  Hinweis auf laufende oder bevorstehende Ferien
/speisekarte      Abschnitte mit Gerichten, Preisen, Allergenen; darunter
                  die PDF-Karte, falls eine da ist
/news             Liste, hervorgehobene zuoberst
/news/[slug]      Einzelne Neuigkeit
/leistungen
/team             Nach Bereich gruppiert
/oeffnungszeiten  Reguläre Zeiten plus Ferien und besondere Tage

Sprachumschalter de/fr/it/en, Sprache in der Adresse: /fr/speisekarte

## Abrufen

Beim Bauen holen, nicht im Browser:

```ts
const antwort = await fetch(url, { next: { revalidate: 3600 } })
```

Setz KEINE eigene, längere Cache-Dauer davor — die API steuert sie über
`next_change_at` selbst, damit eine Mittagskarte um 11:00 erscheint und nicht
irgendwann danach.

## Was ich sehen will

Keine Design-Show, sondern ob die Daten tragen: schlichtes, sauberes Layout,
lesbar auf dem Handy. Wichtiger ist, dass jeder Sonderfall stimmt:

- ein Gericht ohne Preis
- ein Abschnitt ohne Gerichte
- eine Neuigkeit ohne Bild
- ein Teammitglied ohne Bereich
- ein Tag, an dem geschlossen ist
- Ferien, die erst in zwei Wochen beginnen
- eine Sprache, in der nur ein Teil übersetzt ist

Bau das, starte es und zeig mir Screenshots der Seiten.
````

---

## Vorher im Admin anlegen

Damit die Website etwas zu zeigen hat, unter `admin.vinamo.ch` beim Mandanten
`vinamo-test` je Typ ein bis zwei Einträge anlegen **und veröffentlichen** —
Entwürfe liefert die API nicht aus.

Mindestens diese Sonderfälle, damit der Test etwas wert ist:

| Typ | Was anlegen |
| --- | --- |
| Speisekarte | ein Abschnitt mit drei Gerichten, davon eines ohne Preis, eines mit eigenem Allergen |
| Karte als Datei | ein PDF hochladen |
| News | zwei Einträge, einer mit Bild und Häkchen „hervorheben", einer ohne Bild |
| Öffnungszeiten | Mo–Fr mit Mittag und Abend, Sonntag geschlossen |
| Ferien | einmal „Sommerferien" in zwei Wochen, einmal „1. August" als einzelner Tag |
| Team | drei Personen, zwei davon im Bereich „Küche" |
| Leistungen | zwei Einträge, einer mit Bild |

Und mindestens einen Eintrag **auf Französisch übersetzen, aber nicht
vollständig** — dann sieht man, ob der Fallback greift.
