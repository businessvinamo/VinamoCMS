#!/usr/bin/env node
/**
 * Ersten Admin-Zugang anlegen.
 *
 *   node scripts/admin-anlegen.mjs name@vinamo.ch
 *
 * Nötig genau einmal pro Umgebung: Es gibt keine Selbstregistrierung, also
 * braucht der erste Benutzer einen Weg an der Oberfläche vorbei. Alle weiteren
 * Zugänge legt danach ein bestehender Benutzer im Admin an.
 *
 * WARUM DIESES SKRIPT UND NICHT SQL
 * ---------------------------------
 * Ein `insert into auth.users` sieht aus, als würde es reichen -- der Hash
 * stimmt, die Zeile ist da, eine Abfrage bestätigt alles. Die Anmeldung
 * scheitert trotzdem mit "Database error querying schema", weil Supabase Auth
 * zwei Dinge erwartet, die ein SQL-Insert nicht mitliefert:
 *
 *   1. eine Zeile in auth.identities -- über sie findet der E-Mail-Anbieter den
 *      Benutzer überhaupt erst
 *   2. leere Zeichenketten statt NULL in confirmation_token, recovery_token,
 *      email_change und Verwandten -- der Dienst liest sie in nicht-nullable
 *      Felder ein
 *
 * Die Admin-API erledigt beides. Genau dieser Fehler ist beim Einrichten der
 * Staging-Umgebung passiert und hat als "E-Mail oder Passwort falsch"
 * ausgesehen, obwohl das Passwort stimmte.
 */

import { createClient } from '@supabase/supabase-js'
import { randomInt } from 'node:crypto'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const startpasswort = Array.from({ length: 5 }, () =>
  Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''),
).join('-')

const email = process.argv[2]?.trim().toLowerCase()
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!email?.includes('@')) {
  console.error('Aufruf: node scripts/admin-anlegen.mjs name@vinamo.ch')
  process.exit(1)
}
if (!url || !key) {
  console.error('SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY fehlen. Siehe .env.example.')
  process.exit(1)
}

const admin = createClient(url, key, { auth: { persistSession: false } })

const { data: vorhandene } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (vorhandene?.users.some((u) => u.email?.toLowerCase() === email)) {
  console.error(`Für ${email} gibt es bereits ein Konto.`)
  process.exit(1)
}

const { data: neu, error } = await admin.auth.admin.createUser({
  email,
  password: startpasswort,
  email_confirm: true,
  app_metadata: { muss_passwort_aendern: true },
})
if (error) {
  console.error('Konto konnte nicht angelegt werden:', error.message)
  process.exit(1)
}

const { error: rolleFehler } = await admin
  .from('platform_admins')
  .insert({ user_id: neu.user.id, note: 'Über scripts/admin-anlegen.mjs' })
if (rolleFehler) {
  console.error('Admin-Rolle konnte nicht gesetzt werden:', rolleFehler.message)
  process.exit(1)
}

// Nicht nur anlegen, sondern beweisen, dass die Anmeldung auch geht. Genau diese
// Prüfung hat beim ersten Mal gefehlt.
const anon = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY ?? key, {
  auth: { persistSession: false },
})
const probe = await anon.auth.signInWithPassword({ email, password: startpasswort })

console.log('')
console.log('  Adresse        ', email)
console.log('  Startpasswort  ', startpasswort)
console.log('  Rolle           admin')
console.log('  Anmeldung       ', probe.error ? `FEHLGESCHLAGEN: ${probe.error.message}` : 'geprüft, funktioniert')
console.log('')
console.log('  Beim ersten Anmelden muss ein eigenes Passwort gesetzt werden.')
console.log('  Das Startpasswort wird nirgends gespeichert.')
console.log('')

if (probe.error) process.exit(1)
