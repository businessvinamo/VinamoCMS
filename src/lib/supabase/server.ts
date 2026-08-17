import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Supabase-Client für Server-Komponenten, Server-Actions und Route-Handler.
 *
 * Es gibt in dieser Anwendung bewusst KEINEN Supabase-Client im Browser. Alles
 * läuft über die Serverschicht, und zwar mit dem Token des angemeldeten
 * Benutzers -- nicht mit dem Service-Schlüssel. Damit ist Row Level Security
 * nicht Zierde, sondern die tatsächlich wirksame Grenze: Selbst ein Fehler in
 * einer Server-Action kann keine Daten eines fremden Mandanten anfassen.
 *
 * Der zweite Grund: Ab Phase 2 baut die Serverschicht aus der Feldkonfiguration
 * ein Validierungsschema. Läge ein schreibfähiger Client im Browser, wäre diese
 * Prüfung mit der Entwicklerkonsole umgehbar.
 */
export async function createClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL und SUPABASE_PUBLISHABLE_KEY fehlen. Siehe .env.example.',
    )
  }

  const cookieStore = await cookies()

  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // In Server-Komponenten sind Cookies schreibgeschützt. Die Auffrischung
          // des Tokens übernimmt die Middleware, deshalb ist das hier folgenlos.
        }
      },
    },
  })
}
