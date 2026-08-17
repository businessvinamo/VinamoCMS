import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { adminClient } from '@/lib/supabase/admin'

/**
 * Webhook-Zustellung.
 *
 * Standard der Auslieferung ist statisch: Beim Veröffentlichen wird die
 * Kundenseite neu gebaut. Damit bleiben alle Kundenseiten online, auch wenn
 * dieses Backend gerade nicht erreichbar ist -- ein gemeinsames Backend wäre
 * sonst ein einzelner Ausfallpunkt für sämtliche Kundenseiten.
 */

const MAX_VERSUCHE = 6
/** Wartezeit vor Versuch n: 1min, 5min, 15min, 1h, 6h, 24h. */
const WARTEZEIT_MINUTEN = [1, 5, 15, 60, 360, 1440]

export type WebhookEreignis = 'entry.published' | 'entry.unpublished' | 'media.changed'

/**
 * Legt die Zustellung in die Warteschlange -- und stellt sie NICHT sofort zu.
 *
 * Das Veröffentlichen darf nicht daran hängen, ob Vercel gerade antwortet. Der
 * Eintrag ist bereits live; ob die Kundenseite in zehn Sekunden oder in zwei
 * Minuten neu gebaut ist, ändert nichts an der Korrektheit.
 */
export async function sendeWebhooks(
  tenantId: string,
  ereignis: WebhookEreignis,
  nutzlast: Record<string, unknown>,
): Promise<void> {
  const admin = adminClient()

  const { data: hooks } = await admin
    .from('webhooks')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .contains('events', [ereignis])

  if (!hooks?.length) return

  await admin.from('webhook_deliveries').insert(
    hooks.map((h) => ({
      webhook_id: h.id,
      tenant_id: tenantId,
      event: ereignis,
      payload: { ...nutzlast, event: ereignis, at: new Date().toISOString() },
    })),
  )
}

/**
 * Arbeitet fällige Zustellungen ab. Wird vom Zeitplan-Job aufgerufen.
 *
 * Gibt zurück, was passiert ist -- der Job protokolliert das, damit im
 * Fehlerprotokoll sichtbar wird, wenn eine Kundenseite seit Tagen nicht mehr
 * gebaut wurde. Ohne diese Sichtbarkeit veröffentlicht der Kunde, es passiert
 * nichts, und er ruft an.
 */
export async function stelleFaelligeZu(limit = 20): Promise<{ zugestellt: number; fehlgeschlagen: number }> {
  const admin = adminClient()

  const { data: faellig } = await admin
    .from('webhook_deliveries')
    .select('id, attempt, event, payload, webhooks(url, secret)')
    .is('delivered_at', null)
    .lte('next_attempt_at', new Date().toISOString())
    .lt('attempt', MAX_VERSUCHE)
    .order('next_attempt_at')
    .limit(limit)

  let zugestellt = 0
  let fehlgeschlagen = 0

  for (const zustellung of faellig ?? []) {
    const hook = zustellung.webhooks as unknown as { url: string; secret: string } | null
    if (!hook) continue

    const versuch = zustellung.attempt + 1
    const koerper = JSON.stringify(zustellung.payload)
    const signatur = createHmac('sha256', hook.secret).update(koerper).digest('hex')

    let status: number | null = null
    let fehler: string | null = null

    try {
      const antwort = await fetch(hook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vinamo-Event': zustellung.event,
          'X-Vinamo-Signature': `sha256=${signatur}`,
        },
        body: koerper,
        signal: AbortSignal.timeout(10_000),
      })
      status = antwort.status
      if (!antwort.ok) fehler = `HTTP ${antwort.status}`
    } catch (e) {
      fehler = e instanceof Error ? e.message : 'Unbekannter Fehler'
    }

    const erfolg = status !== null && status >= 200 && status < 300
    if (erfolg) zugestellt++
    else fehlgeschlagen++

    const wartezeit = WARTEZEIT_MINUTEN[Math.min(versuch - 1, WARTEZEIT_MINUTEN.length - 1)]

    await admin
      .from('webhook_deliveries')
      .update({
        attempt: versuch,
        status_code: status,
        error: fehler,
        delivered_at: erfolg ? new Date().toISOString() : null,
        next_attempt_at: erfolg
          ? new Date().toISOString()
          : new Date(Date.now() + wartezeit * 60_000).toISOString(),
      })
      .eq('id', zustellung.id)
  }

  return { zugestellt, fehlgeschlagen }
}

/**
 * Prüft eine eingehende Signatur. Für die Kundenseite gedacht, die den Webhook
 * empfängt -- hier mitgeliefert, damit beide Seiten dieselbe Rechnung verwenden.
 */
export function pruefeSignatur(koerper: string, signatur: string, geheimnis: string): boolean {
  const erwartet = `sha256=${createHmac('sha256', geheimnis).update(koerper).digest('hex')}`
  const a = Buffer.from(erwartet)
  const b = Buffer.from(signatur)
  // Längenvergleich zuerst, weil timingSafeEqual bei ungleicher Länge wirft.
  return a.length === b.length && timingSafeEqual(a, b)
}
