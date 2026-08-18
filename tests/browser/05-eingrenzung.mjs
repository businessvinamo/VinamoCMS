import { BASIS, PW, PW_GEWECHSELT, KONTEN, browser, pruefe, bilanz, text } from './hilfe.mjs'
import { readFileSync } from 'node:fs'
const K = readFileSync('kennung.txt', 'utf8').trim()
const NEU = PW_GEWECHSELT

const b = await browser()
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
const p = await ctx.newPage()
const jsFehler = []
p.on('pageerror', (e) => jsFehler.push(e.message))

await p.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
await p.fill('#email', KONTEN.hilfe)
await p.fill('#passwort', NEU)
await p.click('form:has(#passwort) button[type="submit"]')
await p.waitForTimeout(5000)
pruefe('Anmeldung mit gewechseltem Passwort', !p.url().includes('/login') && !p.url().includes('/passwort-neu'), p.url())

// Altes Startpasswort darf nicht mehr gehen
const ctx2 = await b.newContext()
const p2 = await ctx2.newPage()
await p2.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
await p2.fill('#email', KONTEN.hilfe)
await p2.fill('#passwort', PW)
await p2.click('form:has(#passwort) button[type="submit"]')
await p2.waitForTimeout(4000)
pruefe('Altes Startpasswort gilt nicht mehr', p2.url().includes('/login'), p2.url())
await ctx2.close()

// --- Eingegrenzte Rechte -----------------------------------------------------
await p.goto(`${BASIS}/t/${K}`, { waitUntil: 'networkidle' })
const links = await p.locator(`a[href^="/t/${K}/"]`).evaluateAll((as) => as.map((a) => a.getAttribute('href')))
const typen = links.filter((h) => h.split('/').length === 4 && !/benutzer|protokoll/.test(h))
pruefe('Aushilfe sieht nur den freigegebenen Inhaltstyp', typen.length === 1 && typen[0].endsWith('/news'), typen.join(' ') || '(keine)')

await p.goto(`${BASIS}/t/${K}/news`, { waitUntil: 'networkidle' })
pruefe('Freigegebener Typ ist bedienbar', /Neu|anlegen/i.test(await text(p)) && p.url().endsWith('/news'), p.url())

await p.goto(`${BASIS}/t/${K}/menu_section`, { waitUntil: 'networkidle' })
const gesperrt = await text(p)
pruefe('Gesperrter Typ über die Adresszeile ohne Inhalt',
  !p.url().endsWith('/menu_section') || !/Neu anlegen|Neuer /i.test(gesperrt),
  p.url() + ' | ' + gesperrt.slice(0, 130))

await p.goto(`${BASIS}/t/${K}/benutzer`, { waitUntil: 'networkidle' })
const zug = await text(p)
pruefe('Ohne can_manage_users kein Anlegen-Formular', !zug.includes('Zugang hinzufügen'), zug.slice(0, 150))

await p.goto(`${BASIS}/admin`, { waitUntil: 'networkidle' })
pruefe('Adminbereich gesperrt', !p.url().includes('/admin'), p.url())
await p.goto(`${BASIS}/admin/benutzer`, { waitUntil: 'networkidle' })
pruefe('Admin-Benutzerverwaltung gesperrt', !p.url().includes('/admin'), p.url())
await p.goto(`${BASIS}/t/vinamo-test`, { waitUntil: 'networkidle' })
pruefe('Fremder Mandant nicht erreichbar', p.url().includes('unbekannt') || !p.url().includes('vinamo-test'), p.url())

pruefe('Keine Browser-Fehler', jsFehler.length === 0, jsFehler.join(' | '))
await p.screenshot({ path: '05-eingrenzung.png', fullPage: true })
await b.close()
process.exit(bilanz('Phase 5 · Eingrenzung') ? 1 : 0)
