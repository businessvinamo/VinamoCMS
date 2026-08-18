import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import sharp, { type Sharp } from 'sharp'
import { medienAdressen } from '@/lib/medien'
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/** Breiten für das srcset. Deckt Handy bis Netzhaut-Desktop ab. */
const BREITEN = [400, 800, 1200, 1600]
const MAX_BYTES = 15 * 1024 * 1024
const BILDER = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic'])
/**
 * Dokumente werden NICHT umgewandelt, nur abgelegt.
 *
 * Bewusst nur PDF: Es ist überall lesbar, ohne dass der Gast Office braucht.
 * Ein hochgeladenes .docx wäre für die halbe Besucherschaft ein Download, den
 * sie nicht öffnen kann -- und für uns eine Datei, deren Inhalt wir nicht
 * kennen.
 */
const DOKUMENTE = new Set(['application/pdf'])

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
  const istBild = BILDER.has(datei.type)
  const istDokument = DOKUMENTE.has(datei.type)
  if (!istBild && !istDokument) {
    return NextResponse.json(
      { error: 'Erlaubt sind Bilder (JPEG, PNG, WebP, AVIF, HEIC) und PDF-Dateien.' },
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
  if (vorhanden) {
    return NextResponse.json({
      media: { ...vorhanden, ...medienAdressen(vorhanden) }, wiederverwendet: true,
    })
  }

  // ---------------------------------------------------------------------------
  // Dokumente: unverändert ablegen
  //
  // Kein sharp, keine Varianten, kein Zuschnitt. Ein PDF hat keine Breite, in
  // der es sich ausliefern liesse -- der Gast lädt es, wie es ist.
  // ---------------------------------------------------------------------------
  if (istDokument) {
    const pfad = `${tenantId}/${checksum.slice(0, 16)}.pdf`
    const { error: hochladen } = await admin.storage
      .from('media').upload(pfad, roh, { contentType: 'application/pdf', upsert: true })
    if (hochladen) {
      console.error('[media] PDF-Upload fehlgeschlagen', hochladen.message)
      return NextResponse.json({ error: 'Die Datei konnte nicht gespeichert werden.' }, { status: 502 })
    }

    const { data: dokument, error: dFehler } = await admin
      .from('media')
      .insert({
        tenant_id: tenantId,
        path: pfad,
        original_name: datei.name.slice(0, 200),
        mime: 'application/pdf',
        bytes: roh.length,
        checksum,
        variants: [{ w: 0, path: pfad, bytes: roh.length }],
        created_by: user.id,
      })
      .select('*')
      .single()

    if (dFehler) {
      console.error('[media] Datensatz fehlgeschlagen', dFehler.message)
      return NextResponse.json({ error: 'Die Datei konnte nicht gespeichert werden.' }, { status: 502 })
    }
    return NextResponse.json({
      media: { ...dokument, ...medienAdressen(dokument) }, wiederverwendet: false,
    })
  }

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

  return NextResponse.json({
    media: { ...medium, ...medienAdressen(medium) }, wiederverwendet: false,
  })
}
