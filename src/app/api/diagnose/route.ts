import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Selbstauskunft der Umgebung.
 *
 *   GET /api/diagnose
 *
 * Beantwortet die Frage "warum geht es auf dem Server nicht, aber lokal schon"
 * ohne Zugriff auf die Serverprotokolle des Hosters.
 *
 * Gibt ausschliesslich zurück, OB eine Variable gesetzt ist -- nie ihren Wert
 * und nie einen Ausschnitt davon. Dass jemand erfährt, ob ein Schlüssel
 * konfiguriert ist, ist ungefährlich; der Schlüssel selbst wäre es nicht.
 */
export async function GET() {
  const gesetzt = (name: string) => Boolean(process.env[name]?.trim())

  const umgebung = {
    SUPABASE_URL: gesetzt('SUPABASE_URL'),
    SUPABASE_PUBLISHABLE_KEY: gesetzt('SUPABASE_PUBLISHABLE_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: gesetzt('SUPABASE_SERVICE_ROLE_KEY'),
    NEXT_PUBLIC_SITE_URL: gesetzt('NEXT_PUBLIC_SITE_URL'),
    CRON_SECRET: gesetzt('CRON_SECRET'),
    PREVIEW_TOKEN: gesetzt('PREVIEW_TOKEN'),
  }

  const fehlend = Object.entries(umgebung)
    .filter(([, da]) => !da)
    .map(([name]) => name)

  // Ist die Datenbank ueberhaupt erreichbar? Ein reiner Variablencheck wuerde
  // eine falsch geschriebene URL nicht bemerken.
  let datenbank: string
  try {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_PUBLISHABLE_KEY
    if (!url || !key) {
      datenbank = 'nicht geprüft, Zugangsdaten fehlen'
    } else {
      const antwort = await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: key },
        signal: AbortSignal.timeout(5000),
      })
      datenbank = antwort.ok ? 'erreichbar' : `antwortet mit HTTP ${antwort.status}`
    }
  } catch (e) {
    datenbank = `nicht erreichbar: ${e instanceof Error ? e.message : 'unbekannt'}`
  }

  const betriebsbereit =
    umgebung.SUPABASE_URL && umgebung.SUPABASE_PUBLISHABLE_KEY && datenbank === 'erreichbar'

  return NextResponse.json(
    {
      betriebsbereit,
      laufzeit: `Node ${process.version}`,
      umgebungsvariablen: umgebung,
      fehlend,
      datenbank,
      hinweis: betriebsbereit
        ? 'Anmeldung sollte funktionieren.'
        : 'Ohne SUPABASE_URL und SUPABASE_PUBLISHABLE_KEY kann sich niemand anmelden.',
    },
    { status: betriebsbereit ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
