import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let zwischenspeicher: SupabaseClient | null = null

/**
 * Client mit dem Service-Schlüssel. Umgeht Row Level Security vollständig.
 *
 * Ausschliesslich für Vorgänge ohne angemeldeten Benutzer:
 *   * die öffentliche Lese-API (liefert nur veröffentlichte, gültige Inhalte)
 *   * den Webhook-Zusteller und den Zeitplan-Job
 *   * den Mandanten-Export
 *
 * Nie in einer Server-Action für Kundeneingaben. Dort läuft alles über das Token
 * des Benutzers, damit RLS die wirksame Grenze bleibt und nicht nur Zierde ist.
 */
export function adminClient(): SupabaseClient {
  if (zwischenspeicher) return zwischenspeicher

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY fehlen. Siehe .env.example.')
  }

  zwischenspeicher = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return zwischenspeicher
}
