# Deployment

## Das Wichtigste vorweg

**Das Admin-Backend kann keine statische Website sein.** Wenn ein Hoster
anbietet, „als statische Website fortzufahren", ist das für dieses Projekt keine
Notlösung, sondern ein kaputtes Deployment. Es gäbe dann:

- keine Anmeldung (Magic Link läuft über eine Server-Action und setzt Cookies)
- keinen Editor (Lesen und Schreiben laufen ausschliesslich serverseitig)
- keine Lese-API für die Kundenwebsites (`/api/v1/…`)
- keinen Medien-Upload (`sharp` rechnet Bilder auf dem Server klein)
- keine Terminierung (der Zeitplan-Job unter `/api/cron` läuft nie)

Gebraucht wird eine **Node.js-Laufzeit**, mindestens Version 20.

Die Kundenwebsites sind der umgekehrte Fall: Die sind statisch und dürfen
überall liegen — auch bei Hostinger. Genau dafür ist die Auslieferung so gebaut.

---

## Variante A · Vercel für das Admin (empfohlen)

`vercel.json` liegt bereits im Repository und bringt alles mit: Region `fra1`
für die EU-Datenhaltung und den minütlichen Zeitplan-Job.

1. Repository importieren, Branch **`main`**.
2. Umgebungsvariablen setzen (siehe unten).
3. Domain `admin.vinamo.ch` verbinden.

Der Cron läuft dann automatisch. Nichts weiter zu tun.

---

## Variante B · Eigenbetrieb auf einem VPS

Funktioniert auch bei Hostinger, aber nur auf einem **VPS**, nicht im
Shared Hosting.

```bash
# Node 20 oder neuer vorausgesetzt
npm ci
BUILD_STANDALONE=1 npm run build

cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static

PORT=3000 node .next/standalone/server.js
```

Dauerbetrieb über systemd oder PM2, davor ein Reverse Proxy (nginx, Caddy) mit
TLS für `admin.vinamo.ch`.

**Der Zeitplan-Job läuft hier nicht von selbst.** `vercel.json` liest nur Vercel.
Ohne ihn werden terminierte Inhalte zwar korrekt über die Lese-API ausgeliefert,
aber die statischen Kundenseiten werden zum Stichtag nicht neu gebaut. Also in
die crontab:

```cron
* * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://admin.vinamo.ch/api/cron > /dev/null
```

`sharp` bringt vorkompilierte Binärdateien mit. Auf sehr schlanken Images fehlt
gelegentlich `libvips`; dann `npm rebuild sharp` nach der Installation.

---

## Umgebungsvariablen

| Variable | Wofür | Woher |
| --- | --- | --- |
| `SUPABASE_URL` | Projekt-Adresse | Supabase → Project Settings → API |
| `SUPABASE_PUBLISHABLE_KEY` | Anmeldung, Lesen und Schreiben mit Benutzertoken | ebenda |
| `SUPABASE_SERVICE_ROLE_KEY` | Lese-API, Medien, Webhooks, Export | ebenda — **geheim** |
| `NEXT_PUBLIC_SITE_URL` | Zieladresse der Anmelde-Links | `https://admin.vinamo.ch` |
| `CRON_SECRET` | schützt `/api/cron` | selbst erzeugen, lang und zufällig |
| `PREVIEW_TOKEN` | erlaubt `?at=` in der Lese-API | selbst erzeugen, lang und zufällig |

Ohne `CRON_SECRET` antwortet `/api/cron` mit 401 — der Job ist dann wirkungslos,
aber nicht offen. Ohne `PREVIEW_TOKEN` ist die Vorschau zu einem beliebigen
Zeitpunkt abgeschaltet; die normale Auslieferung läuft weiter.

Zusätzlich in Supabase unter Authentication → URL Configuration eintragen:
`https://admin.vinamo.ch` als Site URL und `https://admin.vinamo.ch/auth/confirm`
als Redirect URL. Sonst führen die Magic Links ins Leere.

---

## Ersten Zugang einrichten

Es gibt keine Selbstregistrierung. Der erste Benutzer jeder Umgebung braucht
deshalb einen Weg an der Oberfläche vorbei:

```bash
npm run admin:anlegen deine@adresse.ch
```

Das Skript legt das Konto über die Admin-API an, vergibt die Rolle `admin`,
zeigt ein Startpasswort und **meldet sich damit testweise an**, bevor es Erfolg
meldet. Alle weiteren Zugänge entstehen danach im Admin unter
`/t/<mandant>/benutzer`.

Lege Auth-Benutzer nie mit `insert into auth.users` an. Das sieht aus, als würde
es funktionieren, aber ohne die zugehörige Zeile in `auth.identities` und mit
`NULL` in den Token-Spalten scheitert die Anmeldung mit einem 500er, der in der
Oberfläche als „Passwort falsch" ankommt. Siehe `docs/entscheide.md`, Eintrag 18.

---

## Kundenwebsites

Ein Deployment pro Kundenseite, mit eigener Domain und `VINAMO_TENANT=<slug>`.
Die Seite holt ihre Inhalte beim Bauen über die Lese-API:

```
GET https://admin.vinamo.ch/api/v1/<mandant>/<sprache>/<inhaltstyp>
```

Für den Rebuild beim Veröffentlichen einen Webhook pro Mandant eintragen. Die
Zustellung ist signiert (`X-Vinamo-Signature`, HMAC-SHA256 über den Rumpf);
`pruefeSignatur()` in `src/lib/webhooks.ts` zeigt die Gegenprüfung.

Weil die Kundenseiten statisch sind, bleiben sie online, auch wenn das Admin
gerade nicht erreichbar ist. Das ist der Grund für diese Aufteilung: Ein
gemeinsames Backend wäre sonst ein einzelner Ausfallpunkt für sämtliche
Kundenseiten.
