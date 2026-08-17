# VinamoCMS

Mandantenfähiges CMS für die Kundenwebsites von [vinamo.ch](https://vinamo.ch).
Eine Codebasis, eine laufende Instanz, alle Kunden — Admin-Oberfläche unter `admin.vinamo.ch`.

**Leitprinzip:** Unterschiede zwischen Kunden sind immer Daten, niemals Code.
Kein `if (tenant === '…')`, keine kundenspezifischen Branches. Alles Kundenspezifische
liegt in `tenants` oder in `tenant_feature_flags`.

## Stand

Phase 1 von 7 steht. Siehe [`docs/umsetzungsplan.html`](docs/umsetzungsplan.html)
für den vollständigen Plan.

| Phase | Inhalt | Status |
| --- | --- | --- |
| 0 | Gerüst, Datenbank, CI | ✅ |
| 1 | Mandanten, Rollen, RLS, Isolationstest, Anmeldung | ✅ |
| 2 | Inhaltstyp-Engine, Editor, Entwurf/Veröffentlichung | offen |
| 3 | Mehrsprachigkeit, Terminierung, Vorschau, Lese-API | offen |
| 4 | Medien | offen |
| 5 | Wiederholgruppen, Speisekarte, Branchen-Baukasten | offen |
| 6 | Betrieb: Audit-UI, Export, Webhook-Protokoll | offen |

## Stack

| Bereich | Wahl |
| --- | --- |
| Admin-Backend | TypeScript, Next.js 15 (App Router) |
| Datenbank, Auth | Supabase, Region **Zürich** (`eu-central-2`) |
| Mandantentrennung | `tenant_id` je Tabelle, erzwungen durch Row Level Security |
| Anmeldung | Magic Link, kein Passwort |

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

## Architekturentscheide

Warum es so gebaut ist und nicht anders: [`docs/entscheide.md`](docs/entscheide.md).

## Brand

Markenpaket unter [`public/brand/`](public/brand/), Regeln in
[`public/brand/README.txt`](public/brand/README.txt).
Violett `#5B3DF5` · Navy `#1B1B33` · Papier `#FBFAF9`.
