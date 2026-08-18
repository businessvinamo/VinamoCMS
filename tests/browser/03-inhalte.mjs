import { BASIS, anmelden, browser, pruefe, bilanz, text } from './hilfe.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
const K = readFileSync('kennung.txt', 'utf8').trim()

const b = await browser()
const { p, jsFehler } = await anmelden(b, 'chef')

pruefe('Client wird direkt in seinen Mandanten geleitet', p.url().includes(`/t/${K}`), p.url())
const start = await text(p)
pruefe('Mandant erscheint nicht doppelt', (start.match(/QA Testbetrieb/g) ?? []).length <= 2, start.slice(0, 120))

await p.goto(`${BASIS}/t/${K}`, { waitUntil: 'networkidle' })
const typen = await p.locator('a[href*="/t/' + K + '/"]').evaluateAll((as) =>
  as.map((a) => a.getAttribute('href')).filter((h) => h.split('/').length === 4))
pruefe('Client sieht Inhaltstypen', typen.length >= 3, typen.join(' '))

// Karten muessen waagrecht stehen: Titel links, Pfeil rechts.
const gestapelt = await p.locator('.karte-klick').evaluateAll((as) =>
  as.filter((a) => getComputedStyle(a).flexDirection !== 'row')
    .map((a) => a.textContent.trim().slice(0, 24)))
pruefe('Karten stehen waagrecht', gestapelt.length === 0, gestapelt.join(', '))

// Behelfsschreibung darf nicht in der Oberflaeche landen.
const behelf = (await text(p)).match(/\b(Oe|Ue|Ae)[a-zäöüß]+/g) ?? []
pruefe('Umlaute statt ae/oe/ue', behelf.length === 0, behelf.join(', '))

// --- News: Eintrag anlegen ---------------------------------------------------
await p.goto(`${BASIS}/t/${K}/news`, { waitUntil: 'networkidle' })
await p.click('button:has-text("Neu"), a:has-text("Neu")')
await p.waitForURL(new RegExp(`/t/${K}/news/[0-9a-f-]{36}`), { timeout: 20000 }).catch(() => {})
pruefe('Neuen Eintrag anlegen', /\/news\/[0-9a-f-]{36}/.test(p.url()), p.url())
const eintragUrl = p.url()

// --- Pflichtfelder: Veroeffentlichen ohne Inhalt muss scheitern --------------
await p.click('button:has-text("Veröffentlichen")')
await p.waitForTimeout(3000)
pruefe('Veröffentlichen ohne Pflichtfeld wird abgelehnt',
  /Pflicht|erforderlich|ausfüllen|fehlt/i.test(await text(p)), (await text(p)).slice(-140))

// --- Felder fuellen ----------------------------------------------------------
const felder = p.locator('input[id^="feld-"], textarea[id^="feld-"]')
const n = await felder.count()
pruefe('Editor zeigt Felder', n > 0, `${n} Felder`)
for (let i = 0; i < n; i++) {
  const f = felder.nth(i)
  const typ = await f.getAttribute('type')
  if (typ === 'checkbox' || typ === 'radio' || typ === 'file') continue
  // Medienfelder erwarten eine Medien-Kennung; Text darin ist zurecht ungueltig.
  const beschriftung = await f.evaluate((el) => el.labels?.[0]?.textContent ?? '')
  if (/bild|foto|medium|logo/i.test(beschriftung)) continue
  if (typ === 'number') await f.fill('3')
  else if (typ === 'date') await f.fill('2026-09-01')
  else if (typ === 'datetime-local') continue
  else await f.fill('QA Schlagzeile ' + i)
}
await p.waitForTimeout(2500)   // automatisches Zwischenspeichern

// --- Veroeffentlichen ---------------------------------------------------------
await p.click('button:has-text("Veröffentlichen")')
await p.waitForTimeout(4000)
const nachVeroeff = await text(p)
pruefe('Veröffentlichen gelingt', /live|veröffentlicht/i.test(nachVeroeff), nachVeroeff.slice(-160))

// --- Uebersetzung -------------------------------------------------------------
const frTab = p.locator('[role="tablist"] button', { hasText: /Franz|FR/i }).first()
if (await frTab.count()) {
  await frTab.click()
  await p.waitForTimeout(800)
  pruefe('Sprachumschaltung vorhanden', true)
  const frFeld = p.locator('input[id^="feld-"]').first()
  if (await frFeld.count()) {
    const hinweis = await text(p)
    pruefe('Fallback-Hinweis bei fehlender Übersetzung', /Noch nicht übersetzt/i.test(hinweis))
    await frFeld.fill('Manchette QA')
    await p.waitForTimeout(2500)
    await p.click('button:has-text("Veröffentlichen")')
    await p.waitForTimeout(4000)
    pruefe('Übersetzung veröffentlichen', !(await text(p)).includes('Da ist etwas schiefgelaufen'))
  }
} else {
  pruefe('Sprachumschaltung vorhanden', false, 'kein FR-Tab')
}

// --- Terminierung -------------------------------------------------------------
const zeit = await p.locator('#valid_from').count()
pruefe('Zeitsteuerung bei News vorhanden', zeit > 0)

writeFileSync('eintrag.txt', eintragUrl)
pruefe('Keine Browser-Fehler', jsFehler.length === 0, jsFehler.join(' | '))
await p.screenshot({ path: '03-editor.png', fullPage: true })
await b.close()
process.exit(bilanz('Phase 3 · Inhalte') ? 1 : 0)
