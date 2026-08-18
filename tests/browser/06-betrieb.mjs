import { BASIS, anmelden, browser, pruefe, bilanz, text } from './hilfe.mjs'
import { readFileSync } from 'node:fs'
const K = readFileSync('kennung.txt', 'utf8').trim()

const b = await browser()
const { p, jsFehler } = await anmelden(b, 'chef')
p.on('dialog', (d) => d.accept())

// --- Eintragsaktionen ---------------------------------------------------------
await p.goto(`${BASIS}/t/${K}/news`, { waitUntil: 'networkidle' })
// Bewusst einen LIVE-Eintrag waehlen: Beim Entwurf fehlt "Entwurf zuruecksetzen"
// zurecht, weil es noch keine veroeffentlichte Version gibt.
const ersterEintrag = p.locator(`a[href^="/t/${K}/news/"]`).filter({ hasText: /Auf der Website/i }).first()
pruefe('Veröffentlichter Eintrag steht in der Liste', await ersterEintrag.count() > 0)
const listeText = await text(p)
pruefe('Zustand wird angezeigt', /Auf der Website|Entwurf|Geplant|Archiviert/i.test(listeText))

await ersterEintrag.click()
await p.waitForURL(/\/news\/[0-9a-f-]{36}/, { timeout: 20000 })
const aktionsBlock = 'details:has(summary:has-text("Weitere Aktionen"))'
await p.locator(aktionsBlock).evaluate((d) => d.setAttribute('open', ''))
await p.waitForTimeout(400)
const aktionen = await text(p)
pruefe('Weitere Aktionen erreichbar', /Archivieren|Von der Website|Löschen/i.test(aktionen))

// Archivieren
await p.click('button:has-text("Von der Website nehmen"), button:has-text("Archivieren")')
await p.waitForTimeout(4000)
pruefe('Archivieren', /zurückholen|Archiviert|wieder veröffentlichen/i.test(await text(p)), (await text(p)).slice(-140))

// Zurueckholen
await p.click('button:has-text("zurückholen"), button:has-text("Zurückholen")').catch(() => {})
await p.waitForTimeout(4000)
pruefe('Zurückholen', !/Archiviert/i.test((await text(p)).slice(-200)), (await text(p)).slice(-120))

// Letzte Version wiederherstellen
await p.locator(aktionsBlock).evaluate((d) => d.setAttribute('open', ''))
await p.waitForTimeout(400)
const wieder = p.locator('button:has-text("Entwurf zurücksetzen")').first()
if (await wieder.count()) {
  await wieder.click(); await p.waitForTimeout(4000)
  pruefe('Entwurf auf veröffentlichten Stand zurücksetzen',
    !(await text(p)).includes('Da ist etwas schiefgelaufen'), (await text(p)).slice(-110))
} else pruefe('Entwurf auf veröffentlichten Stand zurücksetzen', false, 'Knopf nicht gefunden')

// Endgültig löschen -- am Entwurf, nicht am veröffentlichten Eintrag
await p.goto(`${BASIS}/t/${K}/news`, { waitUntil: 'networkidle' })
const entwurf = p.locator(`a[href^="/t/${K}/news/"]`).filter({ hasText: /Entwurf/i }).first()
if (await entwurf.count()) {
  const vorher = await p.locator(`a[href^="/t/${K}/news/"]`).count()
  await entwurf.click()
  await p.waitForURL(/\/news\/[0-9a-f-]{36}/)
  await p.locator(aktionsBlock).evaluate((d) => d.setAttribute('open', ''))
  await p.click('button:has-text("Endgültig löschen")')
  await p.waitForTimeout(4500)
  const nachher = await p.locator(`a[href^="/t/${K}/news/"]`).count()
  pruefe('Eintrag endgültig löschen', nachher === vorher - 1, `${vorher} -> ${nachher}`)
} else pruefe('Eintrag endgültig löschen', false, 'kein Entwurf vorhanden')

// --- Protokoll ------------------------------------------------------------------
await p.goto(`${BASIS}/t/${K}/protokoll`, { waitUntil: 'networkidle' })
const prot = await text(p)
pruefe('Protokoll lädt', !prot.includes('Da ist etwas schiefgelaufen'))
pruefe('Protokoll zeigt Veröffentlichungen', /veröffentlicht|entry\.published|Eintrag/i.test(prot), prot.slice(0, 160))

// --- Einstellungen ----------------------------------------------------------------
await p.goto(`${BASIS}/einstellungen`, { waitUntil: 'networkidle' })
const ein = await text(p)
pruefe('Einstellungen laden', !ein.includes('Da ist etwas schiefgelaufen'))
pruefe('Eigene Angaben sichtbar', ein.includes('qa-chef@vinamo-test.invalid'))
pruefe('Website wird nur einmal genannt', (ein.match(/QA Testbetrieb/g) ?? []).length === 1, String((ein.match(/QA Testbetrieb/g) ?? []).length))

// Falsches aktuelles Passwort
await p.fill('#aktuell', 'ganz-sicher-falsch-123')
await p.fill('#neu', 'ein neuer langer satz 77')
await p.fill('#wiederholung', 'ein neuer langer satz 77')
await p.click('form:has(#aktuell) button[type="submit"]')
await p.waitForTimeout(4000)
pruefe('Falsches aktuelles Passwort wird abgelehnt',
  /stimmt nicht|falsch/i.test(await text(p)) && !(await text(p)).includes('Da ist etwas schiefgelaufen'),
  (await text(p)).slice(-140))

// --- Abmelden ---------------------------------------------------------------------
await p.click('button:has-text("Abmelden")')
await p.waitForTimeout(3000)
pruefe('Abmelden führt zur Anmeldung', p.url().includes('/login'), p.url())
await p.goto(`${BASIS}/t/${K}`, { waitUntil: 'networkidle' })
pruefe('Nach dem Abmelden geschützt', p.url().includes('/login'), p.url())

pruefe('Keine Browser-Fehler', jsFehler.length === 0, jsFehler.join(' | '))
await b.close()
process.exit(bilanz('Phase 6 · Betrieb') ? 1 : 0)
