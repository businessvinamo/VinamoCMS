import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Öffentlich erreichbar. Alles andere verlangt eine Anmeldung. */
const PUBLIC_PATHS = ['/login', '/auth', '/passwort-vergessen']

/**
 * Frischt das Zugriffstoken bei jeder Anfrage auf und schützt alle Seiten
 * ausserhalb von PUBLIC_PATHS.
 *
 * Wichtig: Diese Middleware ist eine Bequemlichkeit, keine Sicherheitsgrenze.
 * Die eigentliche Grenze ist Row Level Security in der Datenbank. Wer hier
 * vorbeikäme, sähe trotzdem keine fremden Daten.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))

  if (!user && !isPublic) {
    const redirect = request.nextUrl.clone()
    redirect.pathname = '/login'
    redirect.searchParams.set('weiter', path)
    return NextResponse.redirect(redirect)
  }

  // Erzwungener Passwortwechsel nach dem ersten Anmelden mit dem Startpasswort.
  //
  // Der Merker steht in app_metadata und nicht in user_metadata: user_metadata
  // darf der Benutzer selbst überschreiben und könnte den Wechsel damit
  // überspringen. app_metadata setzt nur der Service-Schlüssel.
  if (user?.app_metadata?.muss_passwort_aendern === true && path !== '/passwort-neu' && !isPublic) {
    const redirect = request.nextUrl.clone()
    redirect.pathname = '/passwort-neu'
    redirect.search = '?erstmalig=1'
    return NextResponse.redirect(redirect)
  }

  return response
}
