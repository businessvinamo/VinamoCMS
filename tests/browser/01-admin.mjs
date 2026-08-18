import { BASIS, anmelden, browser, pruefe, bilanz, text } from './hilfe.mjs'
import { writeFileSync } from 'node:fs'

const KENNUNG = 'qa-' + Date.now().toString(36)
const b = await browser()
const { p, jsFehler } = await anmelden(b, 'admin')

pruefe('Admin kann sich anmelden', !p.url().includes('/login'), p.url())
pruefe('Admin sieht Verwaltungsbereich', (await text(p)).includes('Mandanten verwalten'))

// --- Mandant anlegen -------------------------------------------------------
await p.goto(`${BASIS}/admin/neu`, { waitUntil: 'networkidle' })
await p.fill('#name', 'QA Testbetrieb')
await p.fill('#slug', KENNUNG)
await p.click('label:has-text("Französisch")')
await p.selectOption('#blueprint', 'restaurant')
await p.click('form:has(#slug) button[type="submit"]')
await p.waitForURL(`**/admin/${KENNUNG}`, { timeout: 30000 }).catch(() => {})
pruefe('Mandant anlegen', p.url().includes(`/admin/${KENNUNG}`), p.url())

const detail = await text(p)
pruefe('Branchen-Set schaltet Inhaltstypen frei', /Speisekarte/i.test(detail))
pruefe('Gewählte Sprachen übernommen', /de, fr|fr, de/.test(detail), detail.match(/qa-\S+ · [^|]+/)?.[0] ?? '')

// --- Doppelte Kennung wird abgelehnt ---------------------------------------
await p.goto(`${BASIS}/admin/neu`, { waitUntil: 'networkidle' })
await p.fill('#name', 'Doppelt')
await p.fill('#slug', KENNUNG)
await p.click('form:has(#slug) button[type="submit"]')
await p.waitForTimeout(3000)
pruefe('Doppelte Kennung wird abgelehnt', (await text(p)).includes('schon vergeben'), (await text(p)).slice(-120))

// --- Inhaltstyp nachtraeglich schalten -------------------------------------
await p.goto(`${BASIS}/admin/${KENNUNG}`, { waitUntil: 'networkidle' })
const typKnoepfe = p.locator('.karte:has(h2:text("Inhaltstypen")) button[aria-pressed]')
const anzahlTypen = await typKnoepfe.count()
pruefe('Inhaltstyp-Schalter vorhanden', anzahlTypen > 0, `${anzahlTypen} Typen`)

const aus = p.locator('.karte:has(h2:text("Inhaltstypen")) button[aria-pressed="false"]').first()
if (await aus.count()) {
  await aus.click()
  await p.waitForTimeout(2500)
  const jetztAn = await p.locator('.karte:has(h2:text("Inhaltstypen")) button[aria-pressed="true"]').count()
  pruefe('Inhaltstyp nachträglich freischalten', jetztAn > 0, `${jetztAn} frei`)
}

// --- Funktionsschalter ------------------------------------------------------
const funk = p.locator('.karte:has(h2:text("Funktionen")) button[aria-pressed]')
const anzahlFunk = await funk.count()
pruefe('Funktionsschalter vorhanden', anzahlFunk > 0, `${anzahlFunk} Funktionen`)
if (anzahlFunk > 0) {
  const vorher = await funk.first().getAttribute('aria-pressed')
  await funk.first().click()
  await p.waitForTimeout(2500)
  const nachher = await funk.first().getAttribute('aria-pressed')
  pruefe('Funktion umschalten wirkt', vorher !== nachher, `${vorher} -> ${nachher}`)
  await funk.first().click()   // zuruecksetzen
  await p.waitForTimeout(2000)
}

// --- Stilllegen und reaktivieren -------------------------------------------
p.on('dialog', (d) => d.accept())
await p.click('button:has-text("Mandant stilllegen")')
await p.waitForTimeout(2500)
pruefe('Mandant stilllegen', (await text(p)).includes('Mandant aktivieren'))
await p.click('button:has-text("Mandant aktivieren")')
await p.waitForTimeout(2500)
pruefe('Mandant reaktivieren', (await text(p)).includes('Mandant stilllegen'))

// --- Benutzerverwaltung -----------------------------------------------------
await p.goto(`${BASIS}/admin/benutzer`, { waitUntil: 'networkidle' })
const bText = await text(p)
pruefe('Benutzerliste lädt', !bText.includes('Da ist etwas schiefgelaufen'))
pruefe('Alle QA-Konten sichtbar', bText.includes('qa-chef@') && bText.includes('qa-aushilfe@'))
pruefe('Offener Passwortwechsel wird markiert', /Passwort|wechsel|Startpasswort/i.test(bText))

writeFileSync('kennung.txt', KENNUNG)
pruefe('Keine Browser-Fehler', jsFehler.length === 0, jsFehler.join(' | '))
await p.screenshot({ path: '01-admin.png', fullPage: true })
await b.close()
process.exit(bilanz('Phase 1 · Admin') ? 1 : 0)
