'use server'

import { redirect } from 'next/navigation'
import { pruefePasswort } from '@/lib/passwort'
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type PasswortErgebnis = { status: 'idle' | 'fehler'; meldung?: string }

/**
 * Neues Passwort setzen.
 *
 * Deckt zwei Fälle ab: den erzwungenen Wechsel nach dem ersten Anmelden mit dem
 * Startpasswort, und das Zurücksetzen über "Passwort vergessen". Beide Male hat
 * der Benutzer eine gültige Sitzung -- ohne die kommt er hier gar nicht an.
 */
export async function setzeNeuesPasswort(
  _bisher: PasswortErgebnis,
  formular: FormData,
): Promise<PasswortErgebnis> {
  const passwort = String(formular.get('passwort') ?? '')
  const wiederholung = String(formular.get('wiederholung') ?? '')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (passwort !== wiederholung) {
    return { status: 'fehler', meldung: 'Die beiden Passwörter stimmen nicht überein.' }
  }

  const problem = pruefePasswort(passwort, user.email ?? undefined)
  if (problem) return { status: 'fehler', meldung: problem }

  const { error } = await supabase.auth.updateUser({ password: passwort })
  if (error) {
    console.error('[passwort] updateUser fehlgeschlagen', error.message)
    if (error.message.toLowerCase().includes('different from the old')) {
      return { status: 'fehler', meldung: 'Bitte ein anderes als das bisherige Passwort wählen.' }
    }
    return { status: 'fehler', meldung: 'Das Passwort konnte nicht gespeichert werden.' }
  }

  // Merker löschen. Nur mit dem Service-Schlüssel möglich -- app_metadata ist für
  // den Benutzer selbst schreibgeschützt, sonst könnte er den erzwungenen
  // Wechsel einfach überspringen.
  await adminClient().auth.admin.updateUserById(user.id, {
    app_metadata: { muss_passwort_aendern: false },
  })

  redirect('/login?zurueckgesetzt=1')
}
