import { NextResponse, type NextRequest } from 'next/server'
import { adminClientOderNull } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { medienAdressen } from '@/lib/medien'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Einen Mediendatensatz nachladen.
 *
 * Braucht der Editor: Im Feldwert steht nur die Kennung. Ohne diese Route sähe
 * der Kunde beim Öffnen eines bestehenden Eintrags „Bild gesetzt", aber nicht
 * welches.
 *
 * Die Grenze zieht Row Level Security: is_tenant_member() wird mit dem Token
 * des Benutzers gefragt, BEVOR der Service-Schlüssel den Datensatz holt. Ohne
 * diese Reihenfolge wäre die Route ein Weg, an die Medien fremder Mandanten zu
 * kommen -- Kennungen sind zwar nicht zu erraten, aber „nicht zu erraten" ist
 * keine Berechtigungsprüfung.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Ungültige Kennung.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })

  const admin = adminClientOderNull()
  if (!admin) {
    return NextResponse.json(
      { error: 'Server nicht vollständig konfiguriert.' }, { status: 503 },
    )
  }

  const { data: medium } = await admin
    .from('media').select('*').eq('id', id).maybeSingle()
  if (!medium) return NextResponse.json({ error: 'Nicht gefunden.' }, { status: 404 })

  const { data: zugriff } = await supabase
    .rpc('is_tenant_member', { p_tenant_id: medium.tenant_id })
  if (zugriff !== true) {
    // Dieselbe Antwort wie „gibt es nicht": Ein 403 würde verraten, dass die
    // Kennung existiert.
    return NextResponse.json({ error: 'Nicht gefunden.' }, { status: 404 })
  }

  return NextResponse.json({ media: { ...medium, ...medienAdressen(medium) } })
}
