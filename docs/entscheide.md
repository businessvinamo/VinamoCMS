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
