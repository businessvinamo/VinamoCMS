'use server'

import { redirect } from 'next/navigation'
import { pruefePasswort } from '@/lib/passwort'
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type PasswortAendernErgebnis =
  | { status: 'idle' }
  | { status: 'ok'; meldung: string }
  | { status: 'fehler'; meldung: string }

/**
 * Eigenes Passwort ändern.
 *
 * Verlangt das AKTUELLE Passwort, obwohl der Benutzer bereits angemeldet ist.
 * Ohne diese Prüfung genügt ein unbeaufsichtigter Laptop, um das Konto zu
 * übernehmen -- der Angreifer setzt ein neues Passwort und sperrt den
 * Eigentümer aus. Supabase verlangt es von sich aus nicht.
 */
export async function aendereEigenesPasswort(
  _bisher: PasswortAendernErgebnis,
  formular: FormData,
): Promise<PasswortAendernErgebnis> {
  const aktuell = String(formular.get('aktuell') ?? '')
  const neu = String(formular.get('neu') ?? '')
  const wiederholung = String(formular.get('wiederholung') ?? '')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) redirect('/login')

  if (neu !== wiederholung) {
    return { status: 'fehler', meldung: 'Die beiden neuen Passwörter stimmen nicht überein.' }
  }
  if (neu === aktuell) {
    return { status: 'fehler', meldung: 'Das neue Passwort ist dasselbe wie das bisherige.' }
  }

  const problem = pruefePasswort(neu, user.email)
  if (problem) return { status: 'fehler', meldung: problem }

  // Gegenprobe mit dem aktuellen Passwort. Eigener Client, damit die laufende
  // Sitzung dabei nicht angefasst wird.
  const { createClient: reinerClient } = await import('@supabase/supabase-js')
  const pruefer = reinerClient(
    process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error: falsch } = await pruefer.auth.signInWithPassword({
    email: user.email, password: aktuell,
  })
  if (falsch) {
    return { status: 'fehler', meldung: 'Das aktuelle Passwort stimmt nicht.' }
  }

  const { error } = await supabase.auth.updateUser({ password: neu })
  if (error) {
    console.error('[einstellungen] Passwort ändern', error.message)
    return { status: 'fehler', meldung: 'Das Passwort konnte nicht gespeichert werden.' }
  }

  // Merker löschen, falls der Wechsel erzwungen war.
  //
  // adminClient() wirft SYNCHRON, wenn der Service-Schlüssel fehlt -- ein
  // angehängtes .catch() greift dort nicht, weil es nie eine Promise gibt.
  // Ohne dieses try scheiterte die ganze Passwortänderung an einer Nebensache,
  // obwohl das Passwort bereits gespeichert war.
  try {
    await adminClient().auth.admin.updateUserById(user.id, {
      app_metadata: { muss_passwort_aendern: false },
    })
  } catch (e) {
    console.error('[einstellungen] Merker konnte nicht gelöscht werden', e)
  }

  await supabase.rpc('log_audit', {
    p_tenant_id: null, p_action: 'user.password_changed',
    p_target_type: 'user', p_target_id: user.id, p_meta: {},
  })

  return { status: 'ok', meldung: 'Dein neues Passwort ist gespeichert.' }
}
