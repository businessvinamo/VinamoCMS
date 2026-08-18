# Was noch fehlt

Bestandsaufnahme vom 17.08.2026, nach der Einstellungsseite. Sortiert nach
Dringlichkeit, nicht nach Aufwand.

Methode: Abgleich aller exportierten Server-Actions gegen ihre Verwendung in
Komponenten, aller Seiten gegen die erreichbaren Pfade, aller Feldtypen gegen
ihre Eingabemasken. Dabei fielen drei Aktionen ohne Oberfläche auf — darunter
das Abmelden.

---

## Blockiert einen echten Kunden

### Medienwähler mit Zuschnitt
Die grösste Lücke. Upload-Route, Verkleinerung in vier Breiten, WebP,
EXIF-Entfernung und Fokuspunkt sind gebaut — aber im Editor ist ein Bildfeld
ein **Textfeld für die Kennung**. Kein Kunde kann damit ein Bild einsetzen.

Nötig: Mediathek pro Mandant, Upload per Ziehen, Auswahl, Zuschnitt-Dialog mit
erzwungenem Seitenverhältnis, übersetzbarer Alt-Text.

### Sortierung per Drag & Drop
`sortiere()` existiert, ist an keine Oberfläche angeschlossen. Bei sortierbaren
Typen — Speisekarte, Team, Leistungen — bestimmt heute die Anlagereihenfolge,
was auf der Website oben steht. Nicht änderbar.

### Kein E-Mail-Versand
Startpasswörter werden mündlich oder per Chat weitergegeben. Für zwanzig Kunden
tragbar, aber „Passwort vergessen" hängt bereits an Supabase-Mails, deren
Absender und Gestaltung nicht auf Vinamo eingestellt sind.

---

## Fehlt spürbar im Alltag

### Versionsverlauf ansehen
Jede Veröffentlichung schreibt einen Schnappschuss. Zurücksetzen geht nur auf
die **letzte** Version; ältere sind gespeichert, aber nicht erreichbar. Im
Supportfall müsste man in die Datenbank.

### Vorschau
Die API kann jeden Zeitpunkt (`?at=` mit Token). Im Admin gibt es keinen Knopf
dafür — der Kunde sieht seinen Entwurf nirgends, bevor er veröffentlicht.

### Suchen und Filtern in Listen
Bei fünfzig Neuigkeiten scrollt man. Kein Filter nach Zustand
(Entwurf / live / archiviert), keine Suche.

### Eintrag duplizieren
„Wie letzte Woche, aber mit anderem Datum" heisst heute: alles neu tippen.

### Mandant bearbeiten
Nach dem Anlegen lassen sich Name, Sprachen und Branding nicht mehr ändern —
ausser per SQL. Sprachen nachträglich hinzuzufügen ist ein realistischer Wunsch.

### Webhooks über die Oberfläche
Werden per SQL eingetragen. Für jeden neuen Kunden ein manueller Schritt, den
man vergessen kann — und dann baut seine Website nie neu.

---

## Sicherheit und Betrieb

### ~~Kein Rate-Limit auf der Anmeldung~~ · erledigt am 18.08.2026
Gemessen: zwölf falsche Passwörter, zwölfmal dieselbe sofortige Antwort, keine
Sperre — Supabase bremste hier gar nicht. Behoben mit Migration 0020: zehn
Fehlversuche je E-Mail-Adresse, dann eine Viertelstunde Pause. Die Prüfung steht
vor dem Anmeldeversuch, nicht danach.

Bleibt offen: Der Zähler läuft nach E-Mail-Adresse. Wer die Adresse eines Kunden
kennt, kann ihn vorübergehend aussperren. Bewusst in Kauf genommen — eine Sperre
nach IP träfe alle Kunden gleichzeitig, weil alle Anfragen vom Server kommen.

### Verweise werden nicht mitgeschrieben
`entry_references` existiert als Tabelle, wird aber von keiner Stelle befüllt.
Die Warnung „dieses Bild wird an vier Stellen verwendet" greift deshalb nicht —
Löschen erzeugt stille tote Verweise.

### Slug-Weiterleitungen nicht in der API
Alte Slugs werden beim Veröffentlichen gespeichert, aber die Lese-API gibt sie
nicht heraus. Die Kundenwebsite kann also keine Weiterleitung bauen, und eine
Umbenennung erzeugt weiterhin einen 404.

### Isolationstest läuft nicht
Inzwischen 20 Fälle geschrieben, aber die Repository-Secrets fehlen. Solange sie fehlen,
belegt **nichts** automatisch, dass Mandant A keine Daten von Mandant B sieht.

### Backup-Wiederherstellung nie geübt
Supabase sichert automatisch. Ob eine Wiederherstellung funktioniert, weiss
niemand, bevor sie einmal durchgespielt wurde.

### Keine eigene 404-Seite
Ein falscher Link zeigt die Next.js-Standardseite auf Englisch.

### Leaked Password Protection ist aus
In der Supabase-Konsole ist der Abgleich neuer Passwörter gegen
HaveIBeenPwned ausgeschaltet. Ein Haken im Dashboard, kein Code — sollte
gesetzt werden, bevor Kunden ihre Passwörter selbst wählen.

### Keine strenge Skript-Richtlinie
Seit 18.08.2026 setzt die Anwendung `frame-ancestors`, `base-uri`,
`form-action`, `nosniff`, `Referrer-Policy` und HSTS. Eine echte `script-src`
fehlt weiterhin: Next.js liefert Inline-Skripte aus, dafür bräuchte es Nonces
durch die ganze Anwendung.

---

## Bewusst nicht gebaut

Steht so in der Spezifikation und bleibt so: Shop, Formularbaukasten,
Newsletter, Terminbuchung, Analytics, visueller Seiten-Baukasten. Layout gehört
ins Template.

Ebenfalls bewusst: Inhaltstypen und Felder ändert nur Vinamo, und zwar per
Migration. Eine Oberfläche dafür wäre die Einladung, Schemaänderungen ohne
Migrationspfad zu machen.

---

## Reihenfolge, die ich vorschlagen würde

1. **Medienwähler mit Zuschnitt** — ohne ihn kann kein Kunde eine Bildseite pflegen
2. **Sortierung per Drag & Drop** — betrifft drei von fünf Inhaltstypen
3. **Vorschau** — der Moment, in dem der Kunde Vertrauen fasst
4. **Isolationstest scharfstellen** — die drei Repository-Secrets hinterlegen; das
   Rate-Limit steht seit 18.08.2026
5. Versionsverlauf, Suche, Duplizieren — Komfort, sobald mehr Inhalt da ist
