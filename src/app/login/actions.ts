'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export type LoginErgebnis = { status: 'idle' | 'gesendet' | 'fehler'; meldung?: string }

/**
 * Anmeldung per Magic Link.
 *
 * Bewusst kein Passwort: Kunden pflegen ihre Seite selten, vergessen Passwörter
 * zuverlässig und legen sich sonst "vinamo2024" zurecht. Ein Link an die
 * bekannte Adresse ist sicherer und für die Zielgruppe der einfachere Weg.
 *
 * Berechtigt wird niemand hier -- wer keine offene Einladung hat, bekommt zwar
 * ein Konto, aber null Mandanten und sieht eine leere Übersicht.
 */
export async function anmeldenMitLink(
  _bisher: LoginErgebnis,
  formular: FormData,
): Promise<LoginErgebnis> {
  const email = String(formular.get('email') ?? '').trim().toLowerCase()
  const weiter = String(formular.get('weiter') ?? '/')

  if (!email || !email.includes('@')) {
    return { status: 'fehler', meldung: 'Bitte eine gültige E-Mail-Adresse eingeben.' }
  }

  const kopf = await headers()
  const herkunft =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (kopf.get('x-forwarded-host')
      ? `https://${kopf.get('x-forwarded-host')}`
      : 'http://localhost:3000')

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${herkunft}/auth/confirm?weiter=${encodeURIComponent(weiter)}`,
    },
  })

  if (error) {
    // Der Grund geht ins Serverprotokoll, nicht an den Browser: Ob eine Adresse
    // bekannt ist, verrät, wer Kunde bei Vinamo ist.
    console.error('[login] signInWithOtp fehlgeschlagen', error.message)
    return {
      status: 'fehler',
      meldung: 'Der Link konnte nicht verschickt werden. Bitte in einer Minute erneut versuchen.',
    }
  }

  return { status: 'gesendet' }
}
