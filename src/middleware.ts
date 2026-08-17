import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  /*
   * API-Routen sind ausdrücklich AUSGENOMMEN.
   *
   * Ohne diesen Ausschluss beantwortet die Middleware jede unangemeldete
   * Anfrage mit einer Weiterleitung auf /login -- auch die, die gar nicht
   * angemeldet sein sollen:
   *
   *   /api/v1/...    die öffentliche Lese-API. Jede Kundenwebsite hätte beim
   *                  Bauen HTML statt JSON bekommen. Das ist der Zweck des
   *                  ganzen Systems.
   *   /api/cron      der Zeitplan-Job kommt mit einem Bearer-Token, nicht mit
   *                  einem Cookie. Terminierte Inhalte wären nie ausgeliefert
   *                  worden.
   *   /api/diagnose  soll gerade dann erreichbar sein, wenn die Anmeldung nicht
   *                  funktioniert.
   *
   * Das ist kein Loch: /api/media und /api/export prüfen die Anmeldung selbst
   * mit getUser(), /api/cron prüft CRON_SECRET, und hinter allem steht weiterhin
   * Row Level Security. Die Middleware war dort nie die Grenze, nur eine
   * Bequemlichkeit für Seitenaufrufe.
   */
  matcher: ['/((?!api|_next/static|_next/image|brand|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
