import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Öffentlich erreichbar. Alles andere verlangt eine Anmeldung. */
const PUBLIC_PATHS = ['/login', '/auth']

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

  return response
}
