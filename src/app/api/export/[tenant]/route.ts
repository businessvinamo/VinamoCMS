import { NextResponse, type NextRequest } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Datenexport eines Mandanten.
 *
 * Zwei Zwecke: Auskunftsrecht nach DSGVO und revDSG, und der Fall, dass ein
 * Kunde geht. Beides verlangt, dass die Daten vollständig und ohne Vinamo
 * verwertbar sind -- deshalb enthält der Export die Inhaltstyp-Definitionen mit,
 * nicht nur die Werte. Ein Export aus lauter Schlüsseln ohne Bedeutung wäre
 * formal erfüllt und praktisch wertlos.
 *
 * Medien liegen als absolute URLs bei, damit sie sich ohne Zugangsdaten
 * herunterladen lassen.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const { tenant: slug } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })

  // Mit dem Token des Benutzers: RLS entscheidet, ob er den Mandanten sieht.
  const { data: mandant } = await supabase
    .from('tenants').select('*').eq('slug', slug).maybeSingle()
  if (!mandant) return NextResponse.json({ error: 'Unbekannter Mandant.' }, { status: 404 })

  // Export darf nur, wer den Mandanten besitzt -- oder Vinamo selbst.
  const { data: darf } = await supabase.rpc('is_tenant_owner', { p_tenant_id: mandant.id })
  if (darf !== true) {
    return NextResponse.json(
      { error: 'Nur der Besitzer dieser Website kann die Daten exportieren.' },
      { status: 403 },
    )
  }

  const admin = adminClient()
  const [typen, felder, aktiv, eintraege, uebersetzungen, medien, medienTexte, protokoll] =
    await Promise.all([
      admin.from('content_types').select('*'),
      admin.from('fields').select('*').order('position'),
      admin.from('tenant_content_types').select('content_type_id, position').eq('tenant_id', mandant.id),
      admin.from('entries').select('*').eq('tenant_id', mandant.id),
      admin.from('entry_translations').select('*').eq('tenant_id', mandant.id),
      admin.from('media').select('*').eq('tenant_id', mandant.id),
      admin.from('media_translations').select('*').eq('tenant_id', mandant.id),
      admin.from('audit_log').select('*').eq('tenant_id', mandant.id).order('created_at'),
    ])

  const aktivierteIds = new Set((aktiv.data ?? []).map((a) => a.content_type_id))
  const basis = `${process.env.SUPABASE_URL}/storage/v1/object/public/media/`

  const export_ = {
    format: 'vinamo-cms-export/1',
    erstellt_am: new Date().toISOString(),
    mandant: {
      slug: mandant.slug, name: mandant.name,
      sprachen: mandant.locales, hauptsprache: mandant.default_locale,
      zeitzone: mandant.timezone, branding: mandant.branding,
    },
    inhaltstypen: (typen.data ?? [])
      .filter((t) => aktivierteIds.has(t.id))
      .map((t) => ({
        ...t,
        felder: (felder.data ?? []).filter((f) => f.content_type_id === t.id),
      })),
    eintraege: (eintraege.data ?? []).map((e) => ({
      ...e,
      uebersetzungen: (uebersetzungen.data ?? []).filter((t) => t.entry_id === e.id),
    })),
    medien: (medien.data ?? []).map((m) => ({
      ...m,
      url: basis + m.path,
      varianten_urls: (m.variants as { w: number; path: string }[]).map((v) => ({
        breite: v.w, url: basis + v.path,
      })),
      alt_texte: (medienTexte.data ?? []).filter((t) => t.media_id === m.id),
    })),
    aenderungsprotokoll: protokoll.data ?? [],
  }

  await supabase.rpc('log_audit', {
    p_tenant_id: mandant.id, p_action: 'tenant.exported',
    p_target_type: 'tenant', p_target_id: mandant.id,
    p_meta: { eintraege: export_.eintraege.length, medien: export_.medien.length },
  })

  return new NextResponse(JSON.stringify(export_, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="vinamo-${slug}-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
