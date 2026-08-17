import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import sharp, { type Sharp } from 'sharp'
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/** Breiten für das srcset. Deckt Handy bis Netzhaut-Desktop ab. */
const BREITEN = [400, 800, 1200, 1600]
const MAX_BYTES = 15 * 1024 * 1024
const ERLAUBT = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic'])

/**
 * Medien-Upload.
 *
 * Kunden laden 8-MB-Handyfotos hoch. Verkleinert wird deshalb serverseitig und
 * nicht im Browser: Auf dem Handy dauert das zu lange, und was im Browser
 * passiert, lässt sich umgehen.
 *
 * Der Upload läuft über den Service-Schlüssel, aber ERST nach der Prüfung, dass
 * der angemeldete Benutzer dem Mandanten angehört. Ohne diese Reihenfolge wäre
 * die Route ein Weg, in fremde Mandanten zu schreiben.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })

  const formular = await request.formData()
  const datei = formular.get('datei')
  const tenantId = String(formular.get('tenant_id') ?? '')

  if (!(datei instanceof File)) {
    return NextResponse.json({ error: 'Keine Datei erhalten.' }, { status: 400 })
  }
  if (datei.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Das Bild ist grösser als 15 MB. Bitte ein kleineres wählen.' },
      { status: 413 },
    )
  }
  if (!ERLAUBT.has(datei.type)) {
    return NextResponse.json(
      { error: 'Nur Bilder im Format JPEG, PNG, WebP, AVIF oder HEIC.' },
      { status: 415 },
    )
  }

  // Mitgliedschaft mit dem Token des Benutzers prüfen -- RLS antwortet.
  const { data: zugriff } = await supabase.rpc('is_tenant_member', { p_tenant_id: tenantId })
  if (zugriff !== true) {
    return NextResponse.json({ error: 'Kein Zugriff auf diesen Mandanten.' }, { status: 403 })
  }

  const roh = Buffer.from(await datei.arrayBuffer())
  const checksum = createHash('sha256').update(roh).digest('hex')
  const admin = adminClient()

  // Dasselbe Bild soll ohne Duplikat mehrfach verwendbar sein.
  const { data: vorhanden } = await admin
    .from('media').select('*').eq('tenant_id', tenantId).eq('checksum', checksum).maybeSingle()
  if (vorhanden) return NextResponse.json({ media: vorhanden, wiederverwendet: true })

  let bild: Sharp
  let breite: number
  let hoehe: number
  try {
    // rotate() ohne Argument wendet die EXIF-Ausrichtung an und entfernt sie --
    // sonst stehen Hochkantfotos vom Handy auf der Website quer.
    bild = sharp(roh, { failOn: 'error' }).rotate()
    const meta = await bild.metadata()
    breite = meta.width ?? 0
    hoehe = meta.height ?? 0
    if (!breite || !hoehe) throw new Error('Keine Bildmasse lesbar')
  } catch {
    return NextResponse.json({ error: 'Die Datei ist kein lesbares Bild.' }, { status: 415 })
  }

  const basis = `${tenantId}/${checksum.slice(0, 16)}`
  const varianten: { w: number; path: string; bytes: number }[] = []

  for (const w of BREITEN) {
    if (w > breite * 1.2) continue  // nicht hochrechnen
    const puffer = await bild
      .clone()
      .resize({ width: w, withoutEnlargement: true })
      // Metadaten werden NICHT mitkopiert: EXIF enthält bei Handyfotos die
      // GPS-Position der Aufnahme. Die gehört nicht auf eine Kundenwebsite.
      .webp({ quality: 82 })
      .toBuffer()

    const pfad = `${basis}-${w}.webp`
    const { error } = await admin.storage
      .from('media').upload(pfad, puffer, { contentType: 'image/webp', upsert: true })
    if (error) {
      console.error('[media] Upload fehlgeschlagen', error.message)
      return NextResponse.json({ error: 'Das Bild konnte nicht gespeichert werden.' }, { status: 502 })
    }
    varianten.push({ w, path: pfad, bytes: puffer.length })
  }

  if (varianten.length === 0) {
    const puffer = await bild.clone().webp({ quality: 82 }).toBuffer()
    const pfad = `${basis}-original.webp`
    await admin.storage.from('media').upload(pfad, puffer, { contentType: 'image/webp', upsert: true })
    varianten.push({ w: breite, path: pfad, bytes: puffer.length })
  }

  const { data: medium, error: dbFehler } = await admin
    .from('media')
    .insert({
      tenant_id: tenantId,
      path: varianten[varianten.length - 1].path,
      original_name: datei.name.slice(0, 200),
      mime: 'image/webp',
      bytes: varianten.reduce((s, v) => s + v.bytes, 0),
      width: breite,
      height: hoehe,
      checksum,
      variants: varianten,
      created_by: user.id,
    })
    .select('*')
    .single()

  if (dbFehler) {
    console.error('[media] Datensatz fehlgeschlagen', dbFehler.message)
    return NextResponse.json({ error: 'Das Bild konnte nicht gespeichert werden.' }, { status: 502 })
  }

  return NextResponse.json({ media: medium, wiederverwendet: false })
}
