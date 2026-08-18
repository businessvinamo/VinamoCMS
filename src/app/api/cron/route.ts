import { NextResponse, type NextRequest } from 'next/server'
import { geheimnisGleich } from '@/lib/geheimnis'
import { adminClient } from '@/lib/supabase/admin'
import { sendeWebhooks, stelleFaelligeZu } from '@/lib/webhooks'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Zeitplan-Job. Läuft minütlich (Vercel Cron).
 *
 * Zwei Aufgaben, und ausdrücklich nicht mehr:
 *
 *  1. Fällige Webhook-Zustellungen abarbeiten.
 *
 *  2. Prüfen, ob seit dem letzten Lauf eine gesetzte Zeitgrenze überschritten
 *     wurde -- publish_at, valid_from oder valid_until -- und dann den Rebuild
 *     der betroffenen Kundenseiten anstossen.
 *
 * Der Job ändert NIE einen Status in der Datenbank. Gültigkeit wird beim Lesen
 * ausgewertet (public_content). Verpasst dieser Job einen Lauf, ist die
 * ausgelieferte Seite verspätet -- aber niemals falsch, und die Lese-API liefert
 * ohnehin sofort das Richtige. Ein Job, der Status umschaltet, hinterlässt bei
 * einem verpassten Lauf dauerhaft falsche Daten.
 */
export async function GET(request: NextRequest) {
  const erwartet = process.env.CRON_SECRET
  const mitgeliefert = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? null

  if (!geheimnisGleich(erwartet, mitgeliefert)) {
    return NextResponse.json({ error: 'Nicht berechtigt.' }, { status: 401 })
  }

  let admin
  try {
    admin = adminClient()
  } catch (e) {
    console.error('[cron] Konfiguration unvollstaendig', e instanceof Error ? e.message : e)
    return NextResponse.json(
      { error: 'Server nicht vollständig konfiguriert. Siehe /api/diagnose.' },
      { status: 503 },
    )
  }

  const jetzt = new Date()
  // Fenster grosszügig, weil ein verpasster Lauf sonst eine Zeitgrenze
  // überspringt. Mehrfach angestossene Rebuilds sind harmlos.
  const seit = new Date(jetzt.getTime() - 10 * 60_000)

  const { data: faellig } = await admin
    .from('entries')
    .select('tenant_id, content_type_id, content_types(key), tenants(slug)')
    .eq('status', 'published')
    .or(
      [
        `and(publish_at.gte.${seit.toISOString()},publish_at.lte.${jetzt.toISOString()})`,
        `and(valid_from.gte.${seit.toISOString()},valid_from.lte.${jetzt.toISOString()})`,
        `and(valid_until.gte.${seit.toISOString()},valid_until.lte.${jetzt.toISOString()})`,
      ].join(','),
    )

  // Pro Mandant nur ein Rebuild, auch wenn mehrere Einträge gleichzeitig fällig
  // werden -- sonst baut die Seite bei einem Saisonwechsel zehnmal.
  const betroffen = new Map<string, string>()
  for (const e of faellig ?? []) {
    const t = e.tenants as unknown as { slug: string } | null
    if (t) betroffen.set(e.tenant_id, t.slug)
  }

  for (const [tenantId, slug] of betroffen) {
    await sendeWebhooks(tenantId, 'entry.published', {
      tenant: slug,
      grund: 'zeitgrenze_erreicht',
    })
  }

  const zustellung = await stelleFaelligeZu()

  return NextResponse.json({
    zeitgrenzen_erreicht: betroffen.size,
    webhooks_zugestellt: zustellung.zugestellt,
    webhooks_fehlgeschlagen: zustellung.fehlgeschlagen,
  })
}
