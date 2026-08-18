import { BASIS, anmelden, browser, pruefe, bilanz, text } from './hilfe.mjs'
import { readFileSync } from 'node:fs'
const K = readFileSync('kennung.txt', 'utf8').trim()

const b = await browser()
const { p, jsFehler } = await anmelden(b, 'admin')

await p.goto(`${BASIS}/t/${K}/benutzer`, { waitUntil: 'networkidle' })
const t0 = await text(p)
pruefe('Zugänge-Seite lädt', !t0.includes('Da ist etwas schiefgelaufen'), t0.slice(0, 100))

// Zugang anlegen -- lokal fehlt der Service-Schluessel, es darf keine
// Fehlerseite geben, sondern eine verstaendliche Meldung.
await p.click('button:has-text("Zugang hinzufügen")').catch(() => {})
await p.waitForTimeout(600)
const hatFormular = await p.locator('#neue-email').count()
pruefe('Formular "Zugang hinzufügen" erreichbar', hatFormular > 0)
if (hatFormular) {
  await p.fill('#neue-email', 'qa-neu@vinamo-test.invalid')
  await p.click('form:has(#neue-email) button[type="submit"]')
  await p.waitForTimeout(4000)
  const t1 = await text(p)
  pruefe('Kein Absturz beim Anlegen ohne Service-Schlüssel',
    !t1.includes('Da ist etwas schiefgelaufen') && !t1.includes('Application error'))
  pruefe('Verständliche Meldung statt Fehlerseite',
    /dem Server fehlt eine Einstellung/.test(t1),
    t1.match(/[^|]*Einstellung[^|]*/)?.[0]?.trim() ?? t1.slice(0, 200))
}
pruefe('Keine Browser-Fehler', jsFehler.length === 0, jsFehler.join(' | '))
await p.screenshot({ path: '02-zugaenge.png', fullPage: true })
await b.close()
process.exit(bilanz('Phase 2 · Zugänge') ? 1 : 0)
