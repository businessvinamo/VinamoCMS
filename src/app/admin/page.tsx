import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Marke } from '@/components/Marke'
import { createClient } from '@/lib/supabase/server'
import { isPlatformAdmin, requireUser } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/** Übersicht aller Mandanten. Nur für die Rolle admin. */
export default async function AdminSeite() {
  await requireUser()
  if (!(await isPlatformAdmin())) redirect('/')

  const supabase = await createClient()
  const [{ data: mandanten }, { data: typen }, { data: mitglieder }] = await Promise.all([
    supabase.from('tenants').select('id, slug, name, locales, default_locale, is_active').order('name'),
    supabase.from('tenant_content_types').select('tenant_id'),
    supabase.from('tenant_members').select('tenant_id'),
  ])

  const zaehle = (liste: { tenant_id: string }[] | null, id: string) =>
    (liste ?? []).filter((z) => z.tenant_id === id).length

  return (
    <main className="huelle">
      <Marke />
      <div className="stapel">
        <div className="stapel-eng">
          <Link href="/" className="leise">← Deine Websites</Link>
          <h1>Mandanten</h1>
          <p className="leise">
            Alle Kunden auf dieser Instanz. Nur du siehst diese Seite.
          </p>
        </div>

        <ul className="liste">
          {(mandanten ?? []).map((m) => (
            <li key={m.id}>
              <Link href={`/admin/${m.slug}`} className="karte karte-klick">
                <span className="stapel-eng">
                  <strong>{m.name}</strong>
                  <span className="leise mono">{m.slug}</span>
                  <span className="leise">
                    {zaehle(typen, m.id)} Inhaltstypen · {zaehle(mitglieder, m.id)} Zugänge ·{' '}
                    {m.locales.join(', ')}
                  </span>
                </span>
                {!m.is_active && <span className="marke-rolle zustand-abgelaufen">Stillgelegt</span>}
              </Link>
            </li>
          ))}
        </ul>

        <Link href="/admin/neu" className="knopf-link">Neuen Mandanten anlegen</Link>
      </div>
    </main>
  )
}
