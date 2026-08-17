# VinamoCMS

Mandantenfähiges CMS für die Kundenwebsites von [vinamo.ch](https://vinamo.ch).
Eine Codebasis, eine laufende Instanz, alle Kunden — Admin-Oberfläche unter `admin.vinamo.ch`.

**Leitprinzip:** Unterschiede zwischen Kunden sind immer Daten, niemals Code.

## Status

Planungsphase. Es ist noch keine Zeile Anwendungscode geschrieben.

- [`docs/umsetzungsplan.html`](docs/umsetzungsplan.html) — Prüfung der Spezifikation, offene Fragen
  und Umsetzungsplan in sieben Phasen. Wartet auf Freigabe.

## Geplanter Stack

| Bereich | Wahl |
| --- | --- |
| Admin-Backend | TypeScript, Next.js (App Router) |
| Datenbank, Auth, Storage | Supabase, Region Frankfurt (EU) |
| Mandantentrennung | `tenant_id` in jeder inhaltlichen Tabelle, erzwungen durch Row Level Security |
| Deployment | Vercel, Serverfunktionen auf EU-Region festgelegt |

## Brand

Das Markenpaket liegt unter [`brand/`](brand/) — SVG für Web und Druck, PNG in festen Grössen.
Regeln und Dateiübersicht in [`brand/README.txt`](brand/README.txt).

| Farbe | Hex |
| --- | --- |
| Violett | `#5B3DF5` |
| Navy | `#1B1B33` |
| Papier | `#FBFAF9` |

Schriften: Space Grotesk (Wortmarke), Plus Jakarta Sans (Titel und Text).
