# Durchklicktests

Fahren die Oberfläche mit einem echten Browser durch — Anmeldung, Mandant
anlegen, Inhalte pflegen, Rechte, Handytauglichkeit. Kein Ersatz für den
Isolationstest, sondern die Ergänzung: Der prüft, was die Datenbank verhindert,
diese hier prüfen, was der Kunde sieht.

**Nicht Teil von `npm test` und nicht Teil von CI.** Sie brauchen einen
laufenden Server, echte Konten und einen Browser — drei Dinge, die ein
Pull-Request-Bau nicht mitbringt.

## Voraussetzungen

```bash
npm i --no-save playwright-core          # bewusst nicht in package.json
export QA_BASIS=http://localhost:4900    # Standard, anpassbar
```

`playwright-core` steht absichtlich **nicht** in den Abhängigkeiten: Es lag dort
schon einmal, ohne im Lockfile zu stehen, und hat `npm ci` in CI zerlegt.

Der Browserpfad steht in `hilfe.mjs` und zeigt auf die vorinstallierte
Chromium-Version der Entwicklungsumgebung.

## Konten

Die Tests erwarten drei Konten mit dem Passwort aus `hilfe.mjs`:

| Konto | Rolle |
| --- | --- |
| `qa-admin@vinamo-test.invalid` | Plattformadministrator |
| `qa-chef@vinamo-test.invalid` | Mandanten-Zugang mit allen Rechten |
| `qa-aushilfe@vinamo-test.invalid` | nur News, keine Benutzerverwaltung |

Konten und Testmandant werden **nicht** automatisch angelegt — sie sind
Testdaten in einer echten Datenbank und sollen nicht bei jedem Lauf entstehen
und wieder verschwinden.

## Reihenfolge

`01-admin` legt den Mandanten an und schreibt die Kennung nach `kennung.txt`;
alle folgenden lesen sie von dort. `04-rechte` ändert das Passwort der Aushilfe
— danach gilt für sie das Passwort aus `05-eingrenzung`.

```bash
node tests/browser/01-admin.mjs
node tests/browser/03-inhalte.mjs
node tests/browser/07-mobil.mjs
```

## Was die Handytests messen

Trefferflächen unter 44 px und waagrechtes Scrollen bei 390 px Breite. Beides
hat schon echte Fehler gefunden — ein unsichtbares Feld, das die Seite auf
422 px aufzog, und Aufklapper mit 32 px Höhe.
