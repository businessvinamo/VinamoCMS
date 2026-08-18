import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { geheimnisGleich } from '@/lib/geheimnis'
import { medienAufloesen } from '@/lib/medien'
import { adminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Obergrenze, wenn sich in absehbarer Zeit nichts ändert. */
const MAX_CACHE_SEKUNDEN = 300
const MIN_CACHE_SEKUNDEN = 10

/**
 * Öffentliche Lese-API.
 *
 *   GET /api/v1/<mandant>/<sprache>/<inhaltstyp>
 *   GET /api/v1/<mandant>/<sprache>/<inhaltstyp>?at=2026-12-24T18:00:00Z   (Vorschau)
 *
 * Liefert ausschliesslich veröffentlichte und zum Abrufzeitpunkt gültige
 * Inhalte. Die Auswertung passiert vollständig serverseitig in public_content --
 * das Frontend prüft nie selbst, ob etwas gilt.
 *
 * Warum eine Next.js-Route und nicht PostgREST direkt: Nur so lassen sich ETag,
 * Cache-Dauer und Rate-Limit erzwingen. Ein offener PostgREST-Zugang wäre daran
 * vorbei abfragbar.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locale: string; type: string }> },
) {
  const { tenant, locale, type } = await params

  // Ein beliebiger Zeitpunkt ist nur mit Vorschau-Token erlaubt. Ohne diese
  // Prüfung könnte jeder unveröffentlichte Aktionen und künftige Preise abrufen,
  // indem er ?at= in die Zukunft setzt.
  const atParam = request.nextUrl.searchParams.get('at')
  const token = request.nextUrl.searchParams.get('token')
  const vorschauErlaubt = geheimnisGleich(process.env.PREVIEW_TOKEN, token)

  if (atParam && !vorschauErlaubt) {
    return NextResponse.json(
      { error: 'Ein abweichender Zeitpunkt ist nur mit gültigem Vorschau-Token erlaubt.' },
      { status: 403 },
    )
  }

  const at = atParam ? new Date(atParam) : new Date()
  if (Number.isNaN(at.getTime())) {
    return NextResponse.json({ error: 'Ungültiger Zeitpunkt in "at".' }, { status: 400 })
  }

  // Fehlt die Serverkonfiguration, wirft adminClient(). Ohne diesen Fang wird
  // daraus ein nackter HTTP 500 -- und die Kundenwebsite, die hier baut, meldet
  // nur "Fehler". Ein 503 mit Klartext spart die Suche im Serverprotokoll.
  let admin
  try {
    admin = adminClient()
  } catch (e) {
    console.error('[api] Konfiguration unvollstaendig', e instanceof Error ? e.message : e)
    return NextResponse.json(
      { error: 'Dieser Server ist nicht vollständig konfiguriert. Siehe /api/diagnose.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const { data, error } = await admin.rpc('public_content', {
    p_tenant_slug: tenant,
    p_type_key: type,
    p_locale: locale,
    p_at: at.toISOString(),
  })

  if (error) {
    console.error('[api] public_content fehlgeschlagen', error.message)
    return NextResponse.json({ error: 'Inhalte nicht verfügbar.' }, { status: 502 })
  }
  if (data?.error) {
    return NextResponse.json({ error: data.error }, { status: 404 })
  }

  // Bild- und Dateifelder tragen eine Kennung. Die Kundenwebsite kann damit
  // nichts anfangen -- sie braucht eine Adresse. Vorher stand in der Anleitung,
  // wie man sie zusammensetzt; jeder Website-Bauer hätte es selbst gebaut, und
  // der erste Tippfehler wäre auf einer Kundenwebsite aufgefallen.
  await medienAufloesen(admin, data)

  const koerper = JSON.stringify(data)
  const etag = `W/"${createHash('sha1').update(koerper).digest('base64url')}"`

  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } })
  }

  // Die Cache-Dauer endet an der nächsten Zeitgrenze.
  //
  // Ohne das widersprechen Caching und Terminierung einander: Eine Antwort mit
  // fünf Minuten Cache würde die Mittagskarte, die um 11:00 gültig wird,
  // irgendwann zwischen 11:00 und 11:05 zeigen -- je nachdem, wann der Cache
  // zufällig gefüllt wurde.
  let maxAge = MAX_CACHE_SEKUNDEN
  if (data?.next_change_at) {
    const bis = Math.floor((new Date(data.next_change_at).getTime() - at.getTime()) / 1000)
    maxAge = Math.max(MIN_CACHE_SEKUNDEN, Math.min(MAX_CACHE_SEKUNDEN, bis))
  }

  return new NextResponse(koerper, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ETag: etag,
      'Cache-Control': vorschauErlaubt
        ? 'private, no-store'
        : `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=60`,
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
