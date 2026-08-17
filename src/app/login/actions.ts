'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type LoginErgebnis = { status: 'idle' | 'fehler'; meldung?: string }

/**
 * Anmeldung mit E-Mail und Passwort.
 *
 * Die Fehlermeldung ist absichtlich für alle Fälle dieselbe -- falsches
 * Passwort, unbekannte Adresse, gesperrtes Konto. Eine Unterscheidung würde
 * verraten, welche Adressen bei Vinamo Kunde sind.
 */
export async function anmelden(
  _bisher: LoginErgebnis,
  formular: FormData,
): Promise<LoginErgebnis> {
  const email = String(formular.get('email') ?? '').trim().toLowerCase()
  const passwort = String(formular.get('passwort') ?? '')
  const rohWeiter = String(formular.get('weiter') ?? '/')

  if (!email || !passwort) {
    return { status: 'fehler', meldung: 'Bitte E-Mail-Adresse und Passwort eingeben.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password: passwort })

  if (error) {
    console.error('[login] fehlgeschlagen für', email, '-', error.message)
    return {
      status: 'fehler',
      meldung: 'E-Mail-Adresse oder Passwort stimmt nicht.',
    }
  }

  // Nur seiteninterne Ziele, sonst wäre ?weiter=https://… eine offene
  // Weiterleitung mit echter vinamo.ch-Adresse -- ideal für Phishing.
  const weiter = rohWeiter.startsWith('/') && !rohWeiter.startsWith('//') ? rohWeiter : '/'
  redirect(weiter)
}

export async function abmelden(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
