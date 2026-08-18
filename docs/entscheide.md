# Architekturentscheide

Warum es so gebaut ist. Jeder Eintrag nennt die Alternative und was sie gekostet hätte.
Neue Einträge kommen unten dazu, bestehende werden nicht umgeschrieben.

---

## 1 · `vinamo_admin` ist keine Mandantenrolle

`tenant_members.role` kennt nur `owner` und `editor`. Die Plattformrolle liegt in
einer eigenen Tabelle `platform_admins`.

**Alternative:** `vinamo_admin` als dritter Wert im Rollen-Enum.
**Warum nicht:** Dann bräuchte Kevin für jeden neuen Kunden eine Mitgliedschaftszeile.
„Mandantenübergreifend" wäre eine Behauptung, die bei jedem Onboarding von Hand
nachgezogen werden müsste — und beim ersten Vergessen still bricht.

---

## 2 · Berechtigungen über `SECURITY DEFINER`-Funktionen, nicht über JWT-Claims

Die RLS-Richtlinien rufen `is_tenant_member()`, `is_tenant_owner()` und
`is_platform_admin()` auf. Diese Funktionen fragen bei jedem Zugriff die
Mitgliedertabelle ab.

**Alternative:** Mandanten und Rolle als Claims ins JWT schreiben (Custom Access
Token Hook). So stand es im ursprünglichen Umsetzungsplan.
**Warum nicht:** Claims sind bis zum nächsten Token-Refresh veraltet. Wer heute
entlassen wird, hätte bis zu eine Stunde weiter Zugriff auf die Kundendaten. Die
Funktionsvariante kostet einen Index-Lookup und entzieht Rechte sofort.
**Preis:** Etwas mehr Last pro Abfrage. Bei unter zwanzig Mandanten irrelevant;
bei dreistelligen Mandantenzahlen neu bewerten.

Alle drei sind `SECURITY DEFINER` — sonst erzeugt eine Richtlinie auf
`tenant_members`, die zur Prüfung selbst `tenant_members` liest, eine
Endlosrekursion und macht die Tabelle für alle unlesbar.

---

## 3 · Kein Supabase-Client im Browser

Anmeldung, Lesen und Schreiben laufen über Server-Komponenten, Server-Actions und
Route-Handler — mit dem Token des Benutzers, nicht mit dem Service-Schlüssel.

**Alternative:** Der übliche Supabase-Weg mit Browser-Client und `NEXT_PUBLIC_*`-Schlüssel.
**Warum nicht:** Ab Phase 2 baut die Serverschicht aus der Feldkonfiguration ein
Validierungsschema. Läge ein schreibfähiger Client im Browser, wäre diese Prüfung
mit der Entwicklerkonsole umgehbar — Pflichtfelder, Preisformate, erlaubte
Rich-Text-Auszeichnungen. RLS würde den Angreifer im eigenen Mandanten halten,
aber nicht davon abhalten, dort Unsinn zu schreiben.

**Restrisiko:** Ein angemeldeter Redakteur hat ein gültiges Token und könnte
PostgREST theoretisch direkt ansprechen. RLS begrenzt ihn dabei auf den eigenen
Mandanten. Ab Phase 2 kommen zusätzlich Struktur-Constraints auf `field_values`.

---

## 4 · Berechtigung wird auf die E-Mail-Adresse ausgestellt, nicht auf den Benutzer

`invitations` trägt die Adresse. Der Trigger `handle_new_user` löst beim ersten
Anmelden alle offenen Einladungen ein und erzeugt daraus Mitgliedschaft und
Plattformrolle.

**Alternative:** Benutzer vorab anlegen und direkt in `tenant_members` eintragen.
**Warum nicht:** Dann müssten Passwörter oder künstliche `auth.users`-Zeilen
geseedet werden. Beides ist Sondercode für den Erstzugang und liegt am Ende als
totes Kennwort in einer Migration.
**Nebenwirkung, die wir wollten:** Der Einladungsablauf für Kunden ist damit
derselbe Mechanismus — er musste nicht zusätzlich gebaut werden.

---

## 5 · Anmeldung per Magic Link, kein Passwort

**Warum:** Die Zielgruppe pflegt ihre Website alle paar Wochen. Passwörter werden
in diesem Rhythmus zuverlässig vergessen und dann durch `vinamo2024` ersetzt. Ein
Link an die bekannte Adresse ist sicherer und für eine Wirtin am Handy der
kürzere Weg.

---

## 6 · Besitzerprüfung zurückgestellt bis zum COMMIT

`assert_tenant_has_owner()` ist ein `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY
DEFERRED`.

**Alternative:** Sofort prüfender Zeilen-Trigger. So war es zuerst gebaut
(Migration 0001).
**Warum nicht:** Der blockierte auch legitime Vorgänge — das Löschen eines
Mandanten samt Mitgliedschaften, den Besitzerwechsel in einer Anweisung und
insbesondere das Löschen eines Auth-Benutzers, der irgendwo alleiniger Besitzer
ist. Also genau den Weg, den eine DSGVO-Löschung nimmt. Aufgefallen beim
Aufräumen nach dem ersten Isolationslauf.

Die Regel lautet heute: *Ein Mandant, der Mitglieder hat, muss mindestens einen
Besitzer haben.* Gar keine Mitglieder ist erlaubt — das ist der Zustand vor dem
Onboarding und nach dem Offboarding.

---

## 7 · Die Selbstprüfung liest den Systemkatalog

`tables_missing_tenant_isolation()` ermittelt zur Laufzeit alle Tabellen mit
`tenant_id` (plus `tenants` selbst) und meldet jede ohne RLS oder ohne Richtlinie.
Der Isolationstest erwartet null Zeilen.

**Alternative:** Pro Tabelle einen Testfall von Hand schreiben.
**Warum nicht:** Bei Tabelle vierzehn wird es vergessen. Diese Variante lässt die
Testsuite bei jeder neuen ungeschützten Tabelle rot werden, ohne dass jemand
daran denken muss — und in Phase 2 kommen `content_types`, `fields`, `entries`,
`entry_translations` und `entry_versions` auf einmal dazu.

---

## 8 · `PUBLIC` bekommt auf keine Funktion `EXECUTE`

Postgres vergibt `EXECUTE` auf neue Funktionen standardmässig an `PUBLIC`. In
Supabase heisst das: jede Funktion in `public` ist als `/rest/v1/rpc/<name>`
erreichbar, auch ohne Anmeldung. Bei `SECURITY DEFINER` ist das die gefährliche
Kombination.

Migration 0007 entzieht alles und gibt gezielt zurück:

| Funktion | `anon` | `authenticated` | Begründung |
| --- | --- | --- | --- |
| `is_tenant_member`, `is_tenant_owner`, `is_platform_admin` | — | ✅ | Die RLS-Richtlinien werten sie mit den Rechten des Abfragenden aus. Ohne Grant schlüge jede Abfrage fehl. Geben nur Auskunft über den Aufrufer selbst. |
| `log_audit` | — | ✅ | Prüft die Mitgliedschaft selbst. |
| `feature_enabled` | — | ✅ | Antwortet seit 0007 nur noch zu Mandanten, denen der Aufrufer angehört. |
| `tables_missing_tenant_isolation` | — | — | Legt die Schemastruktur offen. Nur `service_role`. |
| `handle_new_user`, `assert_tenant_has_owner`, `set_updated_at` | — | — | Trigger-Funktionen, werden nie über die API aufgerufen. |

Gemeldet vom Supabase-Linter (0028 / 0029) nach dem ersten Deploy. Die fünf
verbleibenden Warnungen zu `authenticated` sind bewusst so.

---

## 9 · Mandant im Pfad, nicht in der Subdomain

Das Admin läuft als ein einziges Deployment unter `admin.vinamo.ch`; der Mandant
steht in der URL: `/t/<slug>`. Kundenwebsites bekommen je ein eigenes Deployment
mit eigener Domain und `VINAMO_TENANT` als Umgebungsvariable.

**Alternative:** Eine Frontend-Instanz, die alle Kundendomains bedient und den
Mandanten per Middleware aus dem Hostnamen auflöst.
**Warum nicht jetzt:** Lohnt sich ab etwa dreissig Seiten. Bis dahin ist ein
Deployment pro Kunde einfacher zu verstehen und im Fehlerfall einzeln
abschaltbar. `tenants.primary_domain` existiert bereits, damit der Umbau später
eine Middleware ist und keine Datenmigration.

---

## 10 · Existiert nicht und kein Zugriff sehen gleich aus

`requireTenant()` leitet in beiden Fällen auf dieselbe Seite weiter.

**Warum:** Ein unterscheidbares „gibt es, aber du darfst nicht" würde über
Slug-Raten die Kundenliste von Vinamo preisgeben.

---

## 11 · Die Speisekarte wird flacher modelliert als spezifiziert

Gefordert war: „Eine Speisekarte ist eine Liste von Kategorien, jede mit einer
Liste aus Gericht / Beschreibung / Preis / Allergene." Das sind zwei Ebenen
Wiederholgruppe.

**Umgesetzt:** Nur eine Ebene. Die Kategorie selbst ist ein Eintrag
(`menu_section`), der eine Wiederholgruppe von Gerichten enthält.

**Warum:** Eine doppelt verschachtelte Liste ist auf einem Handy nicht mehr
bedienbar, und die Zuordnung von Übersetzungen zu Zeilen würde doppelt indirekt.
Ein Constraint in Migration 0009 verhindert nested Repeater technisch.

**Was man dadurch gewinnt:** Kategorien sind sortierbar, weil sie Einträge sind.
Jede Kategorie ist ein eigener Bildschirm statt einer Riesenliste. Und eine
einzelne Kategorie lässt sich terminieren — „Spargelkarte nur im Mai" verdrängt
über einen Platz die regulären Vorspeisen, während der Rest der Karte stehen
bleibt. Mit einem einzigen Speisekarten-Eintrag hätte man dafür die ganze Karte
duplizieren müssen.

---

## 12 · Wiederholgruppen brauchen eine eigene Zusammenführung

Gefunden beim ersten Test mit echten Speisekartendaten, nachdem Migration 0011
bereits lief.

`public_content` verschmolz Basiswerte und Übersetzung mit `jsonb_deep_merge`.
Für einfache Felder korrekt. Für Wiederholgruppen nicht:

| Seite | Struktur |
| --- | --- |
| Basis | `"dishes": [ {_id, price, allergens}, … ]` — ein **Array** |
| Übersetzung | `"dishes": { "<zeilen_id>": {dish}, … }` — ein **Objekt** |

`jsonb_deep_merge` verschmilzt nur Objekt mit Objekt; bei ungleichen Typen
gewinnt die rechte Seite. Das Übersetzungsobjekt ersetzte also das Array — und
mit ihm verschwanden Preise, Allergene und die Reihenfolge. Die API hätte
Gerichtsnamen ohne Preise ausgeliefert.

`merge_entry_values` (Migration 0014) führt jetzt zeilenweise zusammen: Die
Reihenfolge kommt aus dem Array der Basis, jede Zeile holt ihre Übersetzung über
ihre stabile `_id` — erst aus der Fallback-Sprache, dann aus der Zielsprache.

Nachgewiesen an einem Fall, der genau diese Klasse Fehler auslöst: Eine Zeile
wird auf Deutsch **vorne** eingefügt und nicht ins Französische übersetzt. Die
französische Ausgabe zeigt danach die richtigen Preise an den richtigen
Gerichten und für die neue Zeile den deutschen Text.

---

## 13 · Die Zeitsteuerung wird beim Lesen gerechnet, der Cron baut nur neu

`entry_status` kennt `draft`, `published`, `archived` — bewusst kein
`scheduled`, obwohl die Spezifikation es auflistet. „Geplant" wird in der
Oberfläche aus `published` plus `publish_at` in der Zukunft abgeleitet.

**Warum:** Ein gespeicherter Status müsste von einem Job umgeschaltet werden.
Verpasst der Job einen Lauf, steht die Datenbank dauerhaft falsch da. So wie es
jetzt ist, kann ein verpasster Lauf nur dazu führen, dass die **statische**
Kundenseite verspätet neu gebaut wird — die Lese-API liefert in derselben
Sekunde das Richtige.

Der Cron in `/api/cron` ändert deshalb nie einen Status. Er stösst nur Rebuilds
an, wenn seit dem letzten Lauf eine Zeitgrenze überschritten wurde, und arbeitet
fällige Webhook-Zustellungen ab. Sein Zeitfenster ist mit zehn Minuten
grosszügig, weil mehrfach angestossene Rebuilds harmlos sind, eine übersprungene
Zeitgrenze aber nicht.

---

## 14 · Cache-Dauer endet an der nächsten Zeitgrenze

`next_content_change()` liefert die früheste bevorstehende Grenze über alle
enthaltenen Einträge; die Lese-API begrenzt `max-age` darauf.

**Warum:** Ohne das widersprechen Caching und Terminierung einander. Eine
Antwort mit fünf Minuten Cache würde die Mittagskarte, die um 11:00 gültig wird,
irgendwann zwischen 11:00 und 11:05 zeigen — je nachdem, wann der Cache zufällig
gefüllt wurde.

---

## 15 · Ein abweichender Zeitpunkt in der API braucht ein Token

`?at=` erlaubt es, die Ausgabe zu einem beliebigen Zeitpunkt zu sehen — die
Grundlage der Vorschau. Ohne Schutz wäre das ein Leck: Jeder könnte
vorbereitete Aktionen und künftige Preise abrufen, indem er `at` in die Zukunft
setzt. Die Route verlangt dafür `PREVIEW_TOKEN` und antwortet in dem Fall mit
`no-store`.

---

## 16 · Passwort statt Magic Link, und keine Selbstregistrierung

Ersetzt Entscheid 5. Auf Wunsch von Kevin, nach Abwägung der Gegenargumente.

**Anmeldung:** E-Mail und Passwort. Der Magic Link ist raus.

Die Gegenargumente zum Magic Link, die den Ausschlag gaben: Die Mail kommt aufs
Handy, gearbeitet wird am Laptop — der Link öffnet sich am falschen Gerät. Dazu
Spam-Ordner, Zustellverzögerung, und Firmen-Mailserver, die Links zur
Virenprüfung vorab anklicken und den Einmal-Token dabei verbrauchen.

Was wir dafür in Kauf nehmen: einen zweiten Anmeldeweg (Passwort vergessen),
der selbst wieder über E-Mail läuft.

**Konten entstehen ausschliesslich durch einen bestehenden Benutzer.** Es gibt
keine Registrierungsseite. Wer einen Zugang anlegt, bekommt einmalig ein
Startpasswort angezeigt, das er weitergibt; gespeichert wird es nie.

Warum das mehr ist als eine Bequemlichkeit: Ohne offene Registrierung gibt es
keine Seite, über die sich herausfinden liesse, welche Adressen bei Vinamo Kunde
sind. Der frühere Einladungsweg blieb als Bootstrap erhalten — der Trigger
`handle_new_user` löst offene Einladungen weiterhin ein, wenn ein Konto entsteht.

**Erzwungener Wechsel beim ersten Anmelden.** Der Merker steht in
`app_metadata`, nicht in `user_metadata`: Letzteres darf der Benutzer selbst
überschreiben und könnte den Wechsel damit überspringen. `app_metadata` setzt
nur der Service-Schlüssel. Die Middleware leitet um, solange der Merker steht.

**Passwortregeln:** nur Mindestlänge (10) und eine Sperrliste naheliegender
Wörter — keine erzwungenen Zeichenklassen. Die erzeugen nachweislich
`Passwort1!`, also ein schlechteres Passwort als eine lange Wortfolge.

**Startpasswort:** 20 Zeichen aus einem Alphabet ohne verwechselbare Zeichen
(kein 0/O, kein 1/l/I), in Vierergruppen. Der Kunde tippt das vom Handy ab, und
„war das eine Null oder ein O" ist ein Support-Anruf.

---

## 17 · Zwei Rollen: admin und client

Vorher: `vinamo_admin`, `owner`, `editor`. Jetzt:

| Rolle | Wer | Darf |
| --- | --- | --- |
| `admin` | Vinamo | Alles, mandantenübergreifend. Inhaltstypen definieren, Mandanten anlegen, Zugänge überall |
| `client` | Kunde | Alles innerhalb des eigenen Mandanten: Inhalte pflegen und weitere Zugänge anlegen |

`editor` entfällt. Braucht ein Kunde eine zweite Person, bekommt sie einen
eigenen `client`-Zugang, keine abgestufte Rolle.

Zwei Dinge fielen dadurch weg:

- `is_tenant_owner()` wäre identisch mit `is_tenant_member()` geworden. Statt
  einer sinnlosen Verdopplung heisst die Funktion jetzt `can_manage_tenant()` —
  ein Name, der die Frage stellt statt die Rolle zu nennen. Käme später doch eine
  reine Leserolle, ändert sich nur diese eine Funktion, nicht zwanzig
  Richtlinien.
- `assert_tenant_has_owner()` ist gegenstandslos. Die Regel schützte davor, dass
  ein Mandant nur noch `editor`-Konten hat und niemand mehr einladen kann.
  Diesen Zustand gibt es nicht mehr.

Der einzige verbliebene Rechteunterschied: Ein `client` kann niemals
Plattformrechte vergeben. Das erzwingt die `WITH CHECK`-Klausel auf
`invitations`.

Der Enum `tenant_role` bleibt mit dem einzigen Wert `client` bestehen — damit
eine spätere abgestufte Rolle keine Schemaänderung an `tenant_members` braucht.

---

## 18 · Auth-Benutzer niemals per SQL anlegen

Beim Einrichten der Staging-Umgebung habe ich den ersten Admin-Zugang mit einem
`insert into auth.users` erzeugt — Passwort als bcrypt-Hash, Metadaten gesetzt,
Rolle vergeben. Eine Abfrage danach bestätigte alles: Hash stimmt, E-Mail
bestätigt, Rolle da, Mandant zugeordnet.

Die Anmeldung scheiterte trotzdem. Supabase Auth antwortete mit HTTP 500 und
`Database error querying schema`, was in der Oberfläche als „E-Mail-Adresse oder
Passwort stimmt nicht" ankam — die Fehlermeldung ist absichtlich unspezifisch,
und genau das hat die Diagnose verzögert.

Zwei Dinge liefert ein SQL-Insert nicht mit:

1. **Keine Zeile in `auth.identities`.** Über sie findet der E-Mail-Anbieter den
   Benutzer überhaupt erst. Ohne sie existiert das Konto für die Anmeldung nicht,
   obwohl es in `auth.users` steht.
2. **`NULL` statt `''`** in `confirmation_token`, `recovery_token`,
   `email_change`, `email_change_token_new` und Verwandten. Der Auth-Dienst liest
   diese Spalten in nicht-nullable Felder ein; ein NULL bricht die Abfrage.

**Regel:** Auth-Benutzer entstehen ausschliesslich über die Admin-API
(`admin.auth.admin.createUser`). Für den Erstzugang jeder Umgebung gibt es dafür
`scripts/admin-anlegen.mjs`.

**Der eigentliche Fehler war aber die Prüfung, nicht der Insert.** Ich hatte
verifiziert, dass der Datenbankzustand stimmt — und daraus geschlossen, dass die
Anmeldung funktioniert. Das ist zweierlei. Das Skript meldet deshalb nicht
„angelegt", sondern meldet erst, nachdem es sich mit dem erzeugten Passwort
tatsächlich angemeldet hat.

---

## 19 · API-Routen gehören nicht hinter die Middleware

Gefunden beim Bauen von `/api/diagnose`: Die Route antwortete mit `307` auf
`/login` statt mit ihrer Auskunft.

Der Matcher der Middleware schloss `/api` nicht aus. Damit beantwortete sie
**jede** unangemeldete Anfrage mit einer Weiterleitung — auch die, die gar nicht
angemeldet sein sollen:

| Route | Folge |
| --- | --- |
| `/api/v1/…` | Die öffentliche Lese-API. Jede Kundenwebsite hätte beim Bauen HTML statt JSON bekommen. Das ist der Zweck des ganzen Systems. |
| `/api/cron` | Kommt mit einem Bearer-Token, nicht mit einem Cookie. Terminierte Inhalte wären nie ausgeliefert worden. |
| `/api/media`, `/api/export` | Tot, obwohl beide ihre Anmeldung selbst prüfen. |
| `/api/diagnose` | Soll gerade dann erreichbar sein, wenn die Anmeldung klemmt. |

Der Ausschluss ist kein Loch. `/api/media` und `/api/export` prüfen mit
`getUser()`, `/api/cron` prüft `CRON_SECRET`, und hinter allem steht Row Level
Security. Die Middleware war dort nie die Grenze, nur eine Bequemlichkeit für
Seitenaufrufe — genau so steht es auch im Kommentar in
`src/lib/supabase/middleware.ts`.

**Warum das so lange unbemerkt blieb:** Build und Typecheck sind grün, die
Anmeldung funktioniert, das Admin funktioniert. Kaputt war nur, was von aussen
kommt — und das hatte bis dahin niemand von aussen aufgerufen. Ein grüner Build
sagt nichts über Routen, die niemand abruft.

---

## 20 · Fehlergrenzen und eine Selbstauskunft der Umgebung

Anlass: eine Meldung „Application error: a client-side exception has occurred"
auf dem Deployment, die weder dem Kunden noch uns etwas sagt.

Neu:

- `src/app/error.tsx` und `global-error.tsx` — nennen die Fehlerkennung, die
  auch im Serverprotokoll steht, sodass sich die zwei Enden verbinden lassen.
  `global-error.tsx` trägt seine Stile inline, weil es greift, wenn schon das
  Wurzel-Layout gescheitert ist und es weder CSS noch Schriften gibt.
- `/api/diagnose` — beantwortet ohne Zugriff auf die Serverprotokolle des
  Hosters die Frage „warum geht es auf dem Server nicht, aber lokal schon".
  Gibt zurück, welche Umgebungsvariablen gesetzt sind und ob Supabase erreichbar
  ist.

Ausschliesslich **ob** eine Variable gesetzt ist, nie ihr Wert und nie ein
Ausschnitt davon. Dass jemand erfährt, ob ein Schlüssel konfiguriert ist, ist
ungefährlich; der Schlüssel selbst wäre es nicht.

Dazu antworten Lese-API und Cron bei fehlender Konfiguration mit `503` und
Klartext statt mit einem nackten `500`.

---

## 21 · Zeitsteuerung ist eine Eigenschaft des Inhaltstyps

Der Editor zeigte den Abschnitt „Zeitsteuerung" bei **jedem** Typ. Bei einer
Neuigkeit oder Speisekarte ist das richtig, bei Team und Leistungen ist es
Ballast — niemand plant eine Mitarbeiterin für den 14. März.

Der Fehler war nicht die Anzeige, sondern dass die Komponente alle Typen gleich
behandelt hat. Ob ein Typ terminierbar ist, ist eine Eigenschaft des Typs und
gehört deshalb in die Daten: `content_types.supports_scheduling` (Migration
0016). Der Editor fragt sie ab, statt es besser zu wissen.

| Typ | Zeitsteuerung | Plätze |
| --- | --- | --- |
| Neuigkeiten | ✅ | — |
| Speisekarte | ✅ | ✅ |
| Öffnungszeiten | ✅ | ✅ |
| Team | — | — |
| Leistungen | — | — |

Dazu ein Constraint: Ein Platz ohne Gültigkeitszeitraum ist sinnlos, also
verlangt `supports_slots` immer `supports_scheduling`. Diese Kombination lässt
sich gar nicht erst eintragen.

---

## 22 · Mandantenverwaltung war nur per SQL möglich

Bis hierher gab es für den Admin keine Oberfläche, um Mandanten anzulegen. Die
Datenbank konnte alles — RLS erlaubt Schreiben auf `tenants` nur der Rolle
`admin`, `apply_blueprint()` existierte — aber wer einen Kunden onboarden
wollte, musste SQL schreiben.

Neu unter `/admin`: Mandanten anlegen mit Branchen-Set, Inhaltstypen pro Kunde
freischalten, Funktionsschalter setzen, Mandanten stilllegen.

Zwei Details, die bewusst so sind:

**Einen Inhaltstyp abschalten löscht keine Einträge.** Ein Typ wird
abgeschaltet, weil der Kunde ihn nicht mehr braucht — nicht, weil seine Inhalte
weg sollen. Wird er wieder freigegeben, ist alles noch da.

**Stilllegen statt Löschen.** Ein stillgelegter Mandant liefert nichts mehr über
die Lese-API; die Kundenwebsite bleibt beim letzten gebauten Stand stehen.
Nichts wird gelöscht — für den Fall, dass ein Kunde zurückkommt oder noch
Daten braucht.

---

## 23 · Rechte pro Benutzer statt weiterer Rollen

Bisher durfte jeder Mandanten-Benutzer alles im eigenen Mandanten — Inhalte
pflegen und Zugänge anlegen. Für die Wirtin richtig, für die Aushilfe, die nur
das Tagesmenü tippt, zu viel.

**Alternative:** `editor` wieder einführen.
**Warum nicht:** Rollen sind grobkörnig. Sobald ein Kunde jemanden will, der Team
und News pflegt, aber keine Preise anfasst, braucht es die nächste Rolle. Nach
drei Kunden hat man fünf Rollen, die niemand mehr auseinanderhält.

Stattdessen zwei Angaben an der Mitgliedschaft (Migration 0017):

| Spalte | Bedeutung |
| --- | --- |
| `can_manage_users` | Darf Zugänge anlegen, entfernen, Passwörter zurücksetzen |
| `allowed_content_types` | Welche Inhaltstypen. `NULL` heisst alle freigeschalteten — der Normalfall |

Die Einschränkung steht in der Datenbank, nicht in der Oberfläche:
`can_edit_content_type()` und `can_edit_entry()` tragen die Richtlinien auf
`entries` und `entry_translations`, und `publish_entry()` prüft sie ebenfalls —
sonst könnte ein eingeschränkter Benutzer zwar nichts bearbeiten, aber alles
veröffentlichen.

Bestehende Mitgliedschaften bekamen `can_manage_users = true`. Ein Rechtemodell
einzuführen darf niemandem still etwas wegnehmen.

In der Oberfläche gibt es bewusst **keine Rollennamen**, sondern Haken auf das,
was jemand tatsächlich tun darf. Ein Name wie „Redaktion" beantwortet die Frage
„darf sie an die Preise" nämlich nicht — man muss trotzdem nachschlagen.

---

## 24 · Benutzerlisten ohne Service-Schlüssel

Die Zugangsseiten lasen alle Auth-Konten mit dem Service-Schlüssel und filterten
danach in TypeScript. Zwei Probleme: Der Service-Schlüssel umgeht RLS
vollständig — die Grenze lag im Anwendungscode statt in der Datenbank, genau das,
was dieses Projekt sonst überall vermeidet. Und bei tausend Konten holt man
tausend, um zwei anzuzeigen.

Ersetzt durch `tenant_member_accounts(tenant_id)` und `all_user_accounts()`
(Migration 0018). Beide prüfen ihre Berechtigung selbst und geben nur zurück,
was der Aufrufer sehen darf.

---

## 25 · Die Fehlergrenze hat die Mobilprüfung getäuscht

Beim Prüfen der Darstellung auf 390 px meldete das Skript für `/admin/benutzer`
„kein Quer-Scroll, Touch-Ziele ok". Tatsächlich warf die Seite einen Fehler, die
Fehlergrenze aus Eintrag 20 fing ihn ab — und das Skript vermass die tadellos
gestaltete **Fehlerseite**.

Eine gute Fehlerbehandlung macht Fehler unsichtbar. Genau deshalb muss jede
automatische Prüfung zuerst feststellen, ob sie überhaupt die gemeinte Seite vor
sich hat. Das Skript erkennt die Fehlerseite jetzt und meldet sie als Fehler,
statt sie zu vermessen.

**Gefundene und behobene Mängel bei 390 px:**

| Element | Vorher | Jetzt |
| --- | --- | --- |
| Zurück-Links oben | 22 px | 44 px |
| Navigationslinks in Karten | 26 px | 44 px |
| Schalter-Chips | 38 px | 44 px |
| Kleine Knöpfe | 40 px | 44 px |
| Gesperrte Knöpfe | sahen aktiv aus | 40 % Deckkraft |

Kein Quer-Scroll auf keiner der sechs Seiten.

---

## 26 · Abmelden gab es nicht

Bei der Bestandsaufnahme gefunden: Drei Server-Actions existierten, waren aber
an keine Oberfläche angeschlossen — `abmelden`, `sortiere` und
`stelleLetzteVersionWiederHer`. Bei der ersten heisst das: **Niemand konnte sich
abmelden.** Auf einem gemeinsam genutzten Gerät im Restaurant ist das kein
Schönheitsfehler.

Ursache war ein fehlender Rahmen: Jede Seite fing bei `<Marke />` an, es gab
nirgends eine Navigation. Neu `<Kopfzeile />` auf allen angemeldeten Seiten, mit
Einstellungen und Abmelden.

**Lehre für die Bestandsaufnahme:** Eine exportierte Funktion ist kein Feature.
Der Abgleich „welche Aktionen gibt es" gegen „welche werden in einer Komponente
verwendet" fand in Sekunden, was beim Durchklicken nicht auffällt — man klickt
ja auf das, was da ist.

---

## 27 · Passwort ändern verlangt das aktuelle Passwort

`/einstellungen` erlaubt jedem Angemeldeten, sein Passwort selbst zu ändern.
Verlangt wird dabei das **aktuelle** Passwort, obwohl Supabase das von sich aus
nicht tut.

**Warum:** Ohne diese Prüfung genügt ein unbeaufsichtigter Laptop, um das Konto
zu übernehmen — der Angreifer setzt ein neues Passwort und sperrt den Eigentümer
aus. Für eine Wirtin, deren Laptop im Büro hinter der Küche steht, ist das kein
theoretisches Szenario.

Nebenbehoben: `adminClient()` wirft **synchron**, wenn der Service-Schlüssel
fehlt. Ein angehängtes `.catch()` greift dort nicht, weil es nie eine Promise
gibt. Die ganze Passwortänderung wäre an einer Nebensache gescheitert, obwohl
das Passwort bereits gespeichert war.

**Und eine Lehre über das Prüfen:** Mein erster Testlauf meldete, der Benutzer
werde beim Passwortwechsel abgemeldet. Tatsächlich traf `button[type="submit"]`
den Abmelden-Knopf in der neuen Kopfzeile, der im DOM zuerst steht. Kein Fehler
der Anwendung, sondern ein zu grober Selektor — beinahe hätte ich einen Fehler
gemeldet, den es nicht gab.

---

## 28 · Eintrag archivieren statt löschen

Neu im Editor unter „Weitere Aktionen": Entwurf auf den veröffentlichten Stand
zurücksetzen, von der Website nehmen, endgültig löschen.

Die Reihenfolge ist Absicht. Archivieren ist fast immer gemeint, wenn jemand
„löschen" sagt — der Eintrag soll von der Website verschwinden, nicht aus der
Welt. Deshalb steht es davor, ist umkehrbar, und der Löschknopf trägt den Zusatz
„Meist ist Archivieren gemeint."

---

## 29 · RLS beantwortet „darf ich das sehen", nicht „gehört das mir"

Kevin legte einen zweiten Zugang für den Testmandanten an, und der Mandant
erschien danach zweimal in der Übersicht.

In der Datenbank war nichts doppelt — jeder Benutzer hatte genau eine
Mitgliedschaft. Doppelt war die Abfrage:

```ts
// vorher
supabase.from('tenant_members').select('role, tenant:tenants(…)')
```

Kein Filter auf den Benutzer, und im Kommentar darüber stand die Begründung:
das mache RLS, und die Trennung gehöre an eine Stelle statt verstreut in jede
Abfrage. Das war eine Verwechslung zweier verschiedener Fragen.

RLS beantwortet **„welche Zeilen darf ich sehen"**. Die Richtlinie auf
`tenant_members` lautet `is_tenant_member(tenant_id)` — Mitglieder desselben
Mandanten sehen einander. Das ist richtig und für die Benutzerverwaltung
notwendig: Ohne das könnte niemand die Zugangsliste seiner eigenen Website
öffnen.

Die Übersicht stellt aber eine andere Frage: **„welche Zeilen sind meine"**.
Darauf gibt RLS keine Antwort, und darf es auch nicht. Mit zwei Mitgliedern kam
pro Mitglied eine Zeile zurück, beide verknüpft mit demselben Mandanten — auf
der Startseite und unter „Einstellungen" zweimal derselbe Eintrag.

Nachgewiesen mit Impersonation gegen die Produktionsdatenbank, aus Joels Sicht:

| Abfrage | Zeilen | Mandanten |
| --- | --- | --- |
| ohne `user_id`-Filter | 2 | `vinamo-test, vinamo-test` |
| mit `.eq('user_id', …)` | 1 | `vinamo-test` |

Zwei Folgen, die schlimmer waren als die doppelte Kachel:

**Der Direkteinstieg fiel aus.** Die Übersicht leitet bei genau einer
Mitgliedschaft sofort in den Mandanten weiter — der Normalfall für jeden Kunden.
`length === 1` war nicht mehr wahr, also landete Joel auf einer Auswahlseite mit
einer einzigen, doppelt aufgeführten Option.

**`requireTenant()` hatte denselben Fehler, schärfer.** Dort stand
`.eq('tenant_id', …).maybeSingle()` ohne Benutzerfilter. `maybeSingle()` ist bei
zwei Zeilen ein Fehler; der Fehler wurde nicht ausgewertet, die Rolle wurde
still `null`. Bei drei Mitgliedern hätte das jede Mandantenseite getroffen, nicht
nur die Übersicht.

Die Lehre steht jetzt als Kommentar an beiden Stellen: **Wo „meine" gemeint ist,
gehört der Filter in die Abfrage.** RLS ist die Grenze nach aussen, nicht die
Auswahl nach innen. Ein Regressionsfall in `tests/isolation.test.ts` trägt beide
Varianten nebeneinander — die ungefilterte Abfrage *soll* dort zwei Zeilen
liefern, denn genau das ist der Beweis, dass RLS hier nicht die gesuchte Grenze
ist.

---

## 30 · Was ein Testdurchgang mit eigenen Konten zutage fördert

Für den Durchgang habe ich drei eigene Konten angelegt — `qa-admin`,
`qa-chef` (alle Rechte im Mandanten), `qa-aushilfe` (nur News, keine
Benutzerverwaltung) — und einen eigenen Mandanten über die Oberfläche erstellt.
Nicht gegen Attrappen, sondern gegen die echte Datenbank.

Was dabei herauskam, ordnet sich in eine einzige Beobachtung: **Die Datenbank
hielt überall stand. Die Oberfläche und die Fehlerbehandlung nicht.**

### Ein Webhook durfte das Veröffentlichen umbringen

`veroeffentliche()` trug im Kommentar: „Der Rebuild der Kundenseite darf das
Veröffentlichen nicht aufhalten." Der Code tat das Gegenteil. `sendeWebhooks()`
lief nach dem Veröffentlichen, ohne Fang — und wenn dort etwas schiefging, riss
es die ganze Server-Action mit. Der Eintrag war live, der Kunde sah „Da ist
etwas schiefgelaufen" und veröffentlichte ratlos ein zweites Mal.

Aufgefallen, weil der Testserver keinen Service-Schlüssel hatte und
`adminClient()` synchron wirft. Der Auslöser war die Testumgebung, der Fehler
war es nicht: Jeder Netzwerkfehler beim Einreihen hätte dasselbe angerichtet.
`sendeWebhooks()` wirft jetzt nie mehr — es protokolliert.

### `adminClient()` wirft synchron, und niemand fing das

Dieselbe Ursache an fünf weiteren Stellen: Zugang anlegen, Startpasswort
zurücksetzen, Benutzer löschen, Adminrolle setzen, Merker nach dem
Passwortwechsel löschen. Überall die allgemeine Fehlerseite statt eines Satzes.

Der schlimmste Fall war der Passwortwechsel: Das Passwort war gesetzt, aber der
Merker `muss_passwort_aendern` blieb stehen — der Benutzer landete in einer
Endlosschleife auf `/passwort-neu`, mit Fehlerseite. Neu gibt es
`adminClientOderNull()`; jeder Aufrufer, der einen verständlichen Satz
zurückgeben kann, benutzt sie.

### Die Oberfläche zeigte mehr, als sie durfte

Die Aushilfe sah alle fünf Inhaltstypen, öffnete die Speisekarte und fand eine
leere Liste mit „Leg den ersten Eintrag an" — was die Datenbank ihr zurecht
verweigert hätte. Auf der Zugangsseite sah sie „Entfernen" und „Neues
Startpasswort" neben dem Konto des Wirts. Beides ohne Wirkung: Row Level
Security hielt, `can_manage_tenant()` hielt.

Aber `entferneZugang()` gab `void` zurück. Wer klickte, für den passierte
sichtbar **gar nichts**. Ein stiller Nicht-Effekt ist die schlechteste Antwort
auf eine fehlende Berechtigung — er sieht aus wie ein kaputtes Programm.

`ladeInhaltstypen()` beantwortet „was ist für den Mandanten freigeschaltet".
Die Kundenoberfläche braucht die andere Frage: „was darf ich anfassen." Dafür
gibt es jetzt `ladeBearbeitbareInhaltstypen()`. Dieselbe Verwechslung wie bei
Entscheid 29 — nur eine Ebene höher.

### Ein unsichtbares Feld schob die Seite quer

`/einstellungen` liess sich auf dem Handy seitlich scrollen. Ursache: das für
Passwortverwaltungen versteckte Benutzernamen-Feld. `.visuell-versteckt` setzt
`width: 1px`, aber die allgemeine Eingabe-Regel trifft
`input:not([type="checkbox"])…` und schlägt eine einzelne Klasse in der
Spezifität um Längen. Das Feld war absolut positioniert, 390 px breit und
unsichtbar — messbar nur daran, dass die Seite 422 px brauchte.

Auch die Aufklapper im Editor waren 32 px hoch statt 48. Beides gehört zu
„Die Wirtin ändert das Tagesmenü in unter 60 Sekunden vom Handy".

### Und noch eine Lehre über das Prüfen

Mein erster Testlauf meldete, „Mandant anlegen" werfe den Admin auf die
Anmeldeseite. Ich habe die Middleware instrumentiert, Server-Actions verfolgt
und eine Refresh-Token-Rotation vermutet. Tatsächlich traf
`button[type="submit"]` den Abmelden-Knopf in der Kopfzeile, der im DOM zuerst
steht — **derselbe Fehler wie in Entscheid 27, den ich dort bereits
aufgeschrieben hatte.** Ein Testfehler, der eine halbe Stunde Fehlersuche in
fremdem Code auslöste.

---

## 31 · Sicherheitsdurchgang: was die Datenbank hielt und was nicht

Geprüft mit echten Konten gegen die Produktionsdatenbank, nicht auf dem Papier.

### Gehalten hat

| Prüfung | Ergebnis |
| --- | --- |
| Tabellen mit `tenant_id` ohne RLS | 0 |
| Client im Adminbereich (`/admin`, `/admin/benutzer`) | umgeleitet |
| Fremder Mandant über die Adresszeile | „gibt es nicht oder kein Zugriff" |
| Aushilfe entfernt den Zugang des Wirts | von RLS abgewiesen |
| Aushilfe veröffentlicht einen gesperrten Typ | `42501` |
| `?at=` in der Lese-API ohne Vorschau-Token | `403` |
| `/api/cron`, `/api/export`, `/api/media` ohne Anmeldung | `401` |
| Offene Weiterleitung über `?weiter=https://…` | abgefangen |
| `dangerouslySetInnerHTML` irgendwo | keins |
| Geheimnisse im Repository | keine |
| Storage: Schreibrechte für Angemeldete | keine, nur Service-Schlüssel |

### Nicht gehalten hat

**`restore_entry_version` prüfte nur die Mitgliedschaft.** Migration 0017 hatte
`publish_entry` auf `can_edit_content_type` umgestellt, die Schwesterfunktion
aber übersehen. Damit konnte die Aushilfe, die nur News pflegen darf, den
Entwurf eines Speisekarten-Eintrags mit einer alten Version überschreiben.
Nachgewiesen: Der Wert des Entwurfs stand danach tatsächlich auf
„ÜBERSCHRIEBEN". Behoben in Migration 0019, danach abgewiesen und der Entwurf
unverändert.

Die Lehre: Wer eine Prüfung verschärft, muss **jeden** schreibenden Weg auf
dieselben Zeilen mitnehmen. Auf `entries` schreiben `publish_entry` und
`restore_entry_version` — beide gehören an dieselbe Prüfung.

**Kein Schutz gegen Durchprobieren.** Zwölf falsche Passwörter hintereinander,
zwölfmal dieselbe sofortige Antwort, keine Sperre. Migration 0020 bremst jetzt
nach zehn Fehlversuchen je Adresse für eine Viertelstunde. Ausdrücklich nach
E-Mail-Adresse und nicht nach IP: Alle Anfragen kommen vom Server, eine
IP-Sperre träfe alle Kunden gleichzeitig.

**`publish_entry` und `restore_entry_version` waren für `anon` ausführbar.**
Migration 0006 hatte den Grant entzogen, spätere `create or replace`-Läufe
brachten ihn zurück. Ausnutzbar war es nicht — beide prüfen intern, und für
`anon` ist `auth.uid()` NULL. Ein offener Grant auf eine
SECURITY-DEFINER-Funktion macht die innere Prüfung aber zur einzigen Grenze,
und genau das soll sie nicht sein.

**Keine Sicherheitskopfzeilen.** `admin.vinamo.ch` liess sich in einen fremden
Rahmen setzen. Ein angemeldeter Kunde, eine harmlos aussehende Seite, ein Klick
auf „Endgültig löschen", den er nie sehen wollte. Jetzt `X-Frame-Options: DENY`
und `frame-ancestors 'none'`, dazu `Referrer-Policy`, `nosniff`,
`Permissions-Policy` und HSTS. Bewusst ohne `script-src`: Eine strenge
Skript-Richtlinie bräuchte Nonces durch die ganze Anwendung — das ist eine
eigene Aufgabe, kein Nebenbei.

**Geheimnisse wurden mit `===` verglichen.** Vorschau-Token und Cron-Geheimnis
laufen jetzt über `timingSafeEqual`. Kleines Risiko, kleinerer Aufwand.

### Offen und bewusst so

Der Medien-Bucket ist **öffentlich lesbar** — die Bilder stehen auf
Kundenwebsites, das ist der Zweck. Wer die Adresse kennt, sieht die Datei.
Dorthin gehören deshalb keine vertraulichen Dokumente.

`log_audit()` prüft die Mitgliedschaft, aber ein Mitglied kann beliebige
Aktionstexte in das Protokoll **des eigenen** Mandanten schreiben. Der Absender
lässt sich nicht fälschen (`auth.uid()`).

In der Supabase-Konsole ist **„Leaked Password Protection" ausgeschaltet** —
der Abgleich gegen HaveIBeenPwned. Das ist ein Haken im Dashboard, kein Code,
und sollte gesetzt werden.

---

## 32 · Was der Kunde sieht, ist nicht, was die Datenbank weiss

Vier Rückmeldungen zur Mandantenseite, alle am selben Tag, alle dasselbe
Grundproblem: Die Seite zeigte den Aufbau des Systems statt der Arbeit des
Kunden.

### Jede anklickbare Karte war senkrecht gestapelt

```css
.karte      { display: flex; flex-direction: column; }
.karte-klick{ display: flex; justify-content: space-between; align-items: center; }
```

Beide Klassen hängen am selben Element. `flex-direction` steht nur in der
ersten — die zweite überschreibt sie nicht, weil sie sie gar nicht setzt. Also
blieb `column`, und `align-items: center` schob Titel, Beschreibung und Pfeil
brav in die Mitte. Betroffen war **jede** Liste im ganzen Admin: Websites,
Mandanten, Inhaltstypen, Einträge.

Dass meine Handytests das nicht fanden, ist die eigentliche Lehre: Sie massen
Trefferflächen und Querscrollen — beides war korrekt. Ein senkrecht gestapelter
Knopf ist 94 px hoch und scrollt nicht quer. Die Tests prüfen jetzt zusätzlich
`flex-direction` jeder Karte.

### „Oeffnungszeiten"

Die Seed-Daten schrieben durchgehend `ae`/`oe`/`ue`. Der React-Teil war von
Anfang an korrekt — deshalb fiel es lange nicht auf: Die Oberfläche sah sauber
aus, bis die Inhaltstypen darin auftauchten. Migration 0021 korrigiert Daten,
kein Code, und ein Constraint hält die Behelfsschreibung künftig draussen.

### „Freigeschaltet" mit nackten Schlüsseln

`content_editor`, `translations`, `repeaters` — Vinamo-Interna, in einer
Sprache, die der Kunde nicht spricht, ohne Knopf und ohne Erklärung. Verwaltet
werden sie ohnehin unter `/admin/<kennung>`, dort mit Beschreibung und Schalter.
Die Karte ist auf der Kundenseite weg; der Admin bekommt stattdessen einen Link
dorthin.

Aus demselben Grund gingen zwei weitere Dinge: die Mandanten-Kennung unter dem
Titel (steht in der Lese-API, nicht im Alltag der Wirtin — für den Admin bleibt
sie) und die Zugangsliste aus abgeschnittenen Benutzerkennungen (`a4d16212…`),
wo jetzt E-Mail-Adressen stehen.

### „← Alle Websites" bei genau einer Website

Der Kunde hat eine Website. Die Übersicht leitet ihn deshalb direkt in seinen
Mandanten — der Link zurück führte auf eine Seite, die er nie zu sehen bekommt.
Er erscheint jetzt nur bei mehr als einer Mitgliedschaft oder für den Admin.

### Und die Reihenfolge

Oben stand Sprachen, dann Zugänge, dann Protokoll, dann Freigeschaltet — und
ganz unten, nach viermal Scrollen, das Einzige, wofür der Kunde gekommen ist.
„Inhalte pflegen" steht jetzt zuoberst.

**Der gemeinsame Nenner:** Die Seite war aus der Sicht dessen gebaut, der das
System kennt. Für die Wirtin ist eine Mandanten-Kennung kein Ordnungsmerkmal,
sondern eine Zeichenfolge, die sie beunruhigt.
