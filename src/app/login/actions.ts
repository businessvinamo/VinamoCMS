'use server'

import { redirect } from 'next/navigation'
import { adminClientOderNull } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type LoginErgebnis = { status: 'idle' | 'fehler'; meldung?: string }

const GESPERRT =
  'Zu viele Fehlversuche. Bitte in einer Viertelstunde nochmals — oder das ' +
  'Passwort über „Passwort vergessen" zurücksetzen.'

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

  // Bremse gegen Durchprobieren. Gemessen war vorher nichts da: zwölf falsche
  // Passwörter, zwölfmal dieselbe sofortige Antwort.
  //
  // Die Prüfung steht VOR signInWithPassword. Stünde sie danach, bremste sie nur
  // die Fehlermeldung -- wer beim fünfzigsten Versuch richtig rät, käme trotzdem
  // hinein.
  const bremse = adminClientOderNull()

  if (bremse) {
    const { data: gesperrt, error: bFehler } = await bremse
      .rpc('anmeldung_gesperrt', { p_kennung: email })

    // Ein kaputter Zähler darf niemanden aussperren: Fällt die Bremse aus, wird
    // angemeldet wie zuvor. Sonst legt ein Datenbankfehler das ganze Portal lahm.
    if (bFehler) console.error('[login] Bremse nicht verfügbar', bFehler.message)
    else if (gesperrt === true) return { status: 'fehler', meldung: GESPERRT }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password: passwort })

  if (error) {
    console.error('[login] fehlgeschlagen für', email, '-', error.message)

    if (bremse) {
      const { error: vFehler } = await bremse
        .rpc('anmeldeversuch_verbuchen', { p_kennung: email })
      if (vFehler) console.error('[login] Fehlversuch nicht verbucht', vFehler.message)
    }

    return { status: 'fehler', meldung: 'E-Mail-Adresse oder Passwort stimmt nicht.' }
  }

  // Wer sich dreimal vertippt und dann richtig liegt, soll nicht mit einer halb
  // vollen Sperre weiterleben.
  if (bremse) {
    const { error: rFehler } = await bremse
      .rpc('anmeldeversuche_zuruecksetzen', { p_kennung: email })
    if (rFehler) console.error('[login] Zähler nicht zurückgesetzt', rFehler.message)
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
