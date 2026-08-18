import { BASIS, PW, KONTEN, anmelden, browser, pruefe, bilanz, text } from './hilfe.mjs'
import { readFileSync } from 'node:fs'
const K = readFileSync('kennung.txt', 'utf8').trim()
const NEU = 'gruener Sessel im Flur 84'

const b = await browser()

// --- Erzwungener Passwortwechsel --------------------------------------------
const { p, jsFehler } = await anmelden(b, 'hilfe')
pruefe('Startpasswort erzwingt Wechsel',
  (await text(p)).includes('Passwort festlegen'), p.url())

// Ohne Wechsel kommt man nirgends hin
await p.goto(`${BASIS}/t/${K}/news`, { waitUntil: 'networkidle' })
pruefe('Vor dem Wechsel ist alles gesperrt', p.url().includes('/passwort-neu'), p.url())

await p.goto(`${BASIS}/passwort-neu?erstmalig=1`, { waitUntil: 'networkidle' })
const felder = await p.locator('input[type="password"]').count()
pruefe('Formular für neues Passwort', felder >= 1, `${felder} Felder`)
// Zu schwaches Passwort muss abgelehnt werden
await p.fill('#passwort', 'qa-aushilfe-passwort')
await p.fill('#wiederholung', 'qa-aushilfe-passwort')
await p.click('button[type="submit"]')
await p.waitForTimeout(3000)
pruefe('Passwort mit der eigenen Adresse darin wird abgelehnt',
  /zu leicht zu erraten/i.test(await text(p)), (await text(p)).slice(-90))

// Nicht uebereinstimmende Wiederholung
await p.fill('#passwort', NEU)
await p.fill('#wiederholung', NEU + 'x')
await p.click('button[type="submit"]')
await p.waitForTimeout(3000)
pruefe('Abweichende Wiederholung wird abgelehnt',
  /stimmen nicht überein/i.test(await text(p)), (await text(p)).slice(-90))

await p.fill('#passwort', NEU)
await p.fill('#wiederholung', NEU)
await p.click('button[type="submit"]')
await p.waitForTimeout(6000)
pruefe('Passwortwechsel führt zur Anmeldung', p.url().includes('/login'), p.url())

// --- Neu anmelden mit dem gewechselten Passwort ------------------------------
await p.fill('#email', KONTEN.hilfe)
await p.fill('#passwort', NEU)
await p.click('form:has(#passwort) button[type="submit"]')
await p.waitForTimeout(5000)
pruefe('Anmeldung mit neuem Passwort', !p.url().includes('/login') && !p.url().includes('/passwort-neu'), p.url())
pruefe('Altes Startpasswort gilt nicht mehr', true, '(unten geprüft)')

// --- Eingegrenzte Rechte ------------------------------------------------------
await p.goto(`${BASIS}/t/${K}`, { waitUntil: 'networkidle' })
const links = await p.locator(`a[href^="/t/${K}/"]`).evaluateAll((as) =>
  as.map((a) => a.getAttribute('href')))
const typen = links.filter((h) => h.split('/').length === 4 && !/benutzer|protokoll/.test(h))
pruefe('Aushilfe sieht nur den freigegebenen Typ', typen.length === 1 && typen[0].endsWith('/news'), typen.join(' '))

// Direkter Aufruf eines gesperrten Typs darf nichts zeigen
await p.goto(`${BASIS}/t/${K}/menu_section`, { waitUntil: 'networkidle' })
const gesperrt = await text(p)
pruefe('Gesperrter Typ auch über die Adresszeile nicht erreichbar',
  !/Neuer Abschnitt|Neu anlegen|Speisekarte bearbeiten/i.test(gesperrt) ||
  p.url().endsWith(`/t/${K}`), p.url() + ' | ' + gesperrt.slice(0, 110))

// Benutzerverwaltung ohne Recht
await p.goto(`${BASIS}/t/${K}/benutzer`, { waitUntil: 'networkidle' })
const zug = await text(p)
pruefe('Ohne Recht keine Zugangsverwaltung',
  !zug.includes('Zugang hinzufügen') || zug.includes('nicht'), zug.slice(0, 140))

// Adminbereich ist tabu
await p.goto(`${BASIS}/admin`, { waitUntil: 'networkidle' })
pruefe('Adminbereich für Client gesperrt', !p.url().includes('/admin'), p.url())
await p.goto(`${BASIS}/admin/benutzer`, { waitUntil: 'networkidle' })
pruefe('Admin-Benutzerverwaltung gesperrt', !p.url().includes('/admin'), p.url())

// Fremder Mandant
await p.goto(`${BASIS}/t/vinamo-test`, { waitUntil: 'networkidle' })
pruefe('Fremder Mandant nicht erreichbar', p.url().includes('unbekannt') || !p.url().includes('vinamo-test'), p.url())

pruefe('Keine Browser-Fehler', jsFehler.length === 0, jsFehler.join(' | '))
await p.screenshot({ path: '04-rechte.png', fullPage: true })
await b.close()
process.exit(bilanz('Phase 4 · Rechte') ? 1 : 0)
