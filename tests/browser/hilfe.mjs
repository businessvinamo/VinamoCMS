import { chromium } from 'playwright-core'

export const BASIS = process.env.QA_BASIS ?? 'http://localhost:4900'
/*
  Kein Passwort im Quelltext.

  Beim ersten Ablegen dieser Skripte stand hier eines -- und damit ein
  funktionierendes Plattformadministrator-Konto in einem oeffentlichen
  Repository. Testkonten sind echte Konten in einer echten Datenbank; ihr
  Passwort gehoert in die Umgebung, nicht in eine Datei, die gepusht wird.
*/
export const PW = process.env.QA_PASSWORT ?? ''
export const PW_GEWECHSELT = process.env.QA_PASSWORT_NEU ?? ''

if (!PW || !PW_GEWECHSELT) {
  console.error(
    'QA_PASSWORT und QA_PASSWORT_NEU muessen gesetzt sein.\n' +
    '  export QA_PASSWORT="…"       Startpasswort der drei qa-Konten\n' +
    '  export QA_PASSWORT_NEU="…"   Zielpasswort fuer den Wechseltest (darf die\n' +
    '                               eigene Adresse nicht enthalten)',
  )
  process.exit(2)
}
export const KONTEN = {
  admin: 'qa-admin@vinamo-test.invalid',
  chef: 'qa-chef@vinamo-test.invalid',
  hilfe: 'qa-aushilfe@vinamo-test.invalid',
}

const ergebnisse = []

export function pruefe(name, bedingung, detail = '') {
  const ok = Boolean(bedingung)
  ergebnisse.push({ name, ok, detail })
  console.log(`${ok ? '  ok  ' : ' FEHL '} ${name}${detail ? '  — ' + detail : ''}`)
  return ok
}

export function bilanz(titel) {
  const schlecht = ergebnisse.filter((e) => !e.ok)
  console.log(`\n== ${titel}: ${ergebnisse.length - schlecht.length}/${ergebnisse.length} ok`)
  if (schlecht.length) console.log(schlecht.map((e) => '   FEHL: ' + e.name + (e.detail ? ' — ' + e.detail : '')).join('\n'))
  return schlecht.length
}

export async function browser() {
  return chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  })
}

/** Neue Sitzung, angemeldet. Gibt die Seite und die gesammelten JS-Fehler zurueck. */
export async function anmelden(b, konto, { mobil = false } = {}) {
  const ctx = await b.newContext({
    ignoreHTTPSErrors: true,
    ...(mobil ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }
              : { viewport: { width: 1280, height: 900 } }),
  })
  const p = await ctx.newPage()
  const jsFehler = []
  p.on('pageerror', (e) => jsFehler.push(e.message))
  await p.goto(`${BASIS}/login`, { waitUntil: 'domcontentloaded' })
  await p.fill('#email', KONTEN[konto] ?? konto)
  await p.fill('#passwort', PW)
  await Promise.all([
    p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {}),
    p.click('form:has(#passwort) button[type="submit"]'),
  ])
  await p.waitForLoadState('networkidle').catch(() => {})
  return { p, ctx, jsFehler }
}

export const text = async (p) => (await p.locator('body').innerText()).replace(/\n+/g, ' | ')
