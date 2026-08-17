# VinamoCMS

Mandantenfähiges CMS für die Kundenwebsites von [vinamo.ch](https://vinamo.ch).
Eine Codebasis, eine laufende Instanz, alle Kunden — Admin-Oberfläche unter `admin.vinamo.ch`.

**Leitprinzip:** Unterschiede zwischen Kunden sind immer Daten, niemals Code.
Kein `if (tenant === '…')`, keine kundenspezifischen Branches. Alles Kundenspezifische
liegt in `tenants` oder in `tenant_feature_flags`.

## Stand

Alle sieben Phasen sind umgesetzt. Siehe [`docs/umsetzungsplan.html`](docs/umsetzungsplan.html)
für den ursprünglichen Plan und [`docs/entscheide.md`](docs/entscheide.md) für die
Begründungen.

| Phase | Inhalt | Status |
| --- | --- | --- |
| 0 | Gerüst, Datenbank, CI | ✅ |
| 1 | Mandanten, Rollen, RLS, Isolationstest, Anmeldung | ✅ |
| 2 | Inhaltstyp-Engine, Editor, Entwurf/Veröffentlichung | ✅ |
| 3 | Mehrsprachigkeit, Terminierung, Lese-API | ✅ |
| 4 | Medien | ✅ |
| 5 | Wiederholgruppen, Speisekarte, Branchen-Baukasten | ✅ |
| 6 | Betrieb: Protokoll, Export, Webhooks | ✅ |

## Stack

| Bereich | Wahl |
| --- | --- |
| Admin-Backend | TypeScript, Next.js 15 (App Router) |
| Datenbank, Auth | Supabase, Region **Zürich** (`eu-central-2`) |
| Mandantentrennung | `tenant_id` je Tabelle, erzwungen durch Row Level Security |
| Anmeldung | E-Mail und Passwort, Konten legt ein bestehender Benutzer an |

## Einrichten

```bash
npm install
cp .env.example .env.local   # Werte aus dem Supabase-Dashboard eintragen
npm run dev
```

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver auf http://localhost:3000 |
| `npm run typecheck` | TypeScript prüfen |
| `npm run build` | Produktionsbuild |
| `npm run test:isolation` | Beweis der Mandantentrennung (braucht Service-Schlüssel) |

Migrationen liegen in `supabase/migrations/` und sind **append-only**. Eine
fehlerhafte Migration wird nie umgeschrieben, sondern durch eine neue korrigiert —
siehe `20260817090500_allow_empty_tenant.sql` als Beispiel.

## Deployment

Siehe [`docs/deployment.md`](docs/deployment.md). Wichtig: Das Admin-Backend
braucht eine Node.js-Laufzeit und kann **keine** statische Website sein.

## Architekturentscheide

Warum es so gebaut ist und nicht anders: [`docs/entscheide.md`](docs/entscheide.md).

## Rollen

| Rolle | Wer | Darf |
| --- | --- | --- |
| `admin` | Vinamo | Alles, mandantenübergreifend — Inhaltstypen definieren, Mandanten anlegen, Zugänge überall |
| `client` | Kunde | Alles im eigenen Mandanten — Inhalte pflegen und weitere Zugänge anlegen |

**Es gibt keine Selbstregistrierung.** Konten legt ein bestehender Benutzer an;
das Startpasswort wird einmalig angezeigt und muss beim ersten Anmelden geändert
werden.

## Öffentliche Lese-API

```
GET /api/v1/<mandant>/<sprache>/<inhaltstyp>
```

Liefert nur veröffentlichte und zum Abrufzeitpunkt gültige Inhalte, Übersetzungen
bereits mit der Hauptsprache verschmolzen. Das Frontend prüft nie selbst, ob
etwas gilt. Antworten tragen ein `ETag`; die Cache-Dauer endet an der nächsten
Zeitgrenze der enthaltenen Inhalte.

Mit `?at=<zeitpunkt>&token=<PREVIEW_TOKEN>` liefert dieselbe Route den Stand zu
einem beliebigen Zeitpunkt — die Grundlage der Vorschau.

## Brand

Markenpaket unter [`public/brand/`](public/brand/), Regeln in
[`public/brand/README.txt`](public/brand/README.txt).
Violett `#5B3DF5` · Navy `#1B1B33` · Papier `#FBFAF9`.
