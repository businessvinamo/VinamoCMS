import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Einlösen des Magic Links.
 *
 * Beim allerersten Anmelden legt Supabase den Auth-Benutzer an. Der Trigger
 * handle_new_user (Migration 0001) löst in derselben Transaktion alle offenen
 * Einladungen für diese Adresse ein -- daraus entstehen Mitgliedschaft und, falls
 * so eingeladen, die Plattformrolle. Der Benutzer landet also bereits berechtigt
 * auf der Übersicht.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  // Nur seiteninterne Ziele. Sonst wäre ?weiter=https://... eine offene
  // Weiterleitung, die sich für Phishing mit echter vinamo.ch-Adresse eignet.
  const roh = searchParams.get('weiter') ?? '/'
  const weiter = roh.startsWith('/') && !roh.startsWith('//') ? roh : '/'

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/login?fehler=link`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash })

  if (error) {
    console.error('[auth] verifyOtp fehlgeschlagen', error.message)
    return NextResponse.redirect(`${origin}/login?fehler=abgelaufen`)
  }

  return NextResponse.redirect(`${origin}${weiter}`)
}
