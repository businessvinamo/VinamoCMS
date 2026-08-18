import { BASIS, anmelden, browser, pruefe, bilanz, text } from './hilfe.mjs'
import { readFileSync } from 'node:fs'
const K = readFileSync('kennung.txt', 'utf8').trim()
const b = await browser()
const { p, jsFehler } = await anmelden(b, 'chef', { mobil: true })

// Der wichtigste Handy-Fall: Speisekarte mit Wiederholgruppe
for (const typ of ['news', 'menu_section', 'team', 'opening_hours']) {
  await p.goto(`${BASIS}/t/${K}/${typ}`, { waitUntil: 'networkidle' })
  const link = p.locator(`a[href^="/t/${K}/${typ}/"]`).first()
  if (!(await link.count())) {
    await p.click('button:has-text("Neu"), a:has-text("Neu")').catch(() => {})
    await p.waitForTimeout(4000)
  } else await link.click()
  await p.waitForURL(new RegExp(`/${typ}/[0-9a-f-]{36}`), { timeout: 20000 }).catch(() => {})

  const t = await text(p)
  if (t.includes('Da ist etwas schiefgelaufen')) { pruefe(`Editor ${typ}`, false, 'FEHLERSEITE'); continue }

  const m = await p.evaluate(() => {
    const zuKlein = []
    for (const el of document.querySelectorAll('button, a, input, select, summary, textarea')) {
      if (el.classList.contains('visuell-versteckt')) continue
      const ziel = el.closest('label') ?? el
      const r = ziel.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      if (r.height < 44) zuKlein.push((ziel.textContent || ziel.tagName).trim().slice(0, 22) + ` ${Math.round(r.height)}px`)
    }
    return { zuKlein, querscroll: document.documentElement.scrollWidth > window.innerWidth + 1,
             breite: document.documentElement.scrollWidth }
  })
  pruefe(`Editor ${typ} auf dem Handy`, m.zuKlein.length === 0 && !m.querscroll,
    [m.querscroll ? `Querscroll ${m.breite}px` : '', m.zuKlein.length ? 'zu klein: ' + m.zuKlein.join(', ') : ''].filter(Boolean).join(' | '))
  await p.screenshot({ path: `08-mobil-${typ}.png`, fullPage: true })
}

pruefe('Keine Browser-Fehler', jsFehler.length === 0, jsFehler.join(' | '))
await b.close()
process.exit(bilanz('Phase 8 · Editor mobil') ? 1 : 0)
