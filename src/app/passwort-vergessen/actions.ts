'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export type ResetErgebnis = { status: 'idle' | 'gesendet' | 'fehler'; meldung?: string }

/**
 * Passwort vergessen.
 *
 * Antwortet immer gleich, egal ob die Adresse bekannt ist. Eine Unterscheidung
 * würde verraten, wer bei Vinamo Kunde ist.
 */
export async function sendeZuruecksetzen(
  _bisher: ResetErgebnis,
  formular: FormData,
): Promise<ResetErgebnis> {
  const email = String(formular.get('email') ?? '').trim().toLowerCase()
  if (!email.includes('@')) {
    return { status: 'fehler', meldung: 'Bitte eine gültige E-Mail-Adresse eingeben.' }
  }

  const kopf = await headers()
  const herkunft =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (kopf.get('x-forwarded-host') ? `https://${kopf.get('x-forwarded-host')}` : 'http://localhost:3000')

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${herkunft}/auth/confirm?weiter=/passwort-neu`,
  })

  if (error) console.error('[passwort] resetPasswordForEmail', email, error.message)

  return { status: 'gesendet' }
}
