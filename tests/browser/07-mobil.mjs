import { BASIS, anmelden, browser, pruefe, bilanz, text } from './hilfe.mjs'
import { readFileSync } from 'node:fs'
const K = readFileSync('kennung.txt', 'utf8').trim()

const b = await browser()

async function pruefeSeiten(konto, seiten) {
  const { p, jsFehler } = await anmelden(b, konto, { mobil: true })
  for (const pfad of seiten) {
    await p.goto(BASIS + pfad, { waitUntil: 'networkidle' })
    const t = await text(p)
    if (t.includes('Da ist etwas schiefgelaufen') || t.includes('Application error')) {
      pruefe(`${konto} ${pfad}`, false, 'FEHLERSEITE'); continue
    }
    const messung = await p.evaluate(() => {
      // Gestapelte Karten: .karte setzt flex-direction column, .karte-klick muss
      // row zuruecksetzen. Fehlt das, steht der Pfeil unter dem Titel und alles
      // ist zentriert -- ohne dass Trefferflaeche oder Querscrollen es merken.
      const gestapelt = [...document.querySelectorAll('.karte-klick')]
        .filter((a) => getComputedStyle(a).flexDirection !== 'row')
        .map((a) => a.textContent.trim().slice(0, 24))

      const zuKlein = []
      for (const el of document.querySelectorAll('button, a, input, select, summary')) {
        if (el.classList.contains('visuell-versteckt')) continue
        const ziel = el.closest('label') ?? el
        const r = ziel.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) continue
        if (r.height < 44) zuKlein.push((ziel.textContent || ziel.tagName).trim().slice(0, 24) + ` ${Math.round(r.height)}px`)
      }
      return {
        zuKlein, gestapelt,
        querscroll: document.documentElement.scrollWidth > window.innerWidth + 1,
        breite: document.documentElement.scrollWidth,
      }
    })
    pruefe(`${konto} ${pfad}`,
      messung.zuKlein.length === 0 && !messung.querscroll && messung.gestapelt.length === 0,
      [messung.querscroll ? `Querscroll (${messung.breite}px)` : '',
       messung.zuKlein.length ? 'zu klein: ' + messung.zuKlein.join(', ') : '',
       messung.gestapelt.length ? 'senkrecht gestapelt: ' + messung.gestapelt.join(', ') : '',
      ].filter(Boolean).join(' | '))
  }
  pruefe(`${konto}: keine Browser-Fehler`, jsFehler.length === 0, jsFehler.join(' | '))
  await p.screenshot({ path: `07-mobil-${konto}.png`, fullPage: true })
}

await pruefeSeiten('admin', ['/', '/admin', '/admin/neu', '/admin/benutzer', `/admin/${K}`, '/einstellungen'])
await pruefeSeiten('chef', [`/t/${K}`, `/t/${K}/news`, `/t/${K}/benutzer`, `/t/${K}/protokoll`, '/einstellungen'])

await b.close()
process.exit(bilanz('Phase 7 · Mobil') ? 1 : 0)
