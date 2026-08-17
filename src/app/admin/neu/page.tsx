import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Marke } from '@/components/Marke'
import { MandantFormular } from '@/components/MandantFormular'
import { createClient } from '@/lib/supabase/server'
import { isPlatformAdmin, requireUser } from '@/lib/tenant'
import { legeMandantAn } from '../actions'

export const dynamic = 'force-dynamic'

export default async function NeuerMandant() {
  await requireUser()
  if (!(await isPlatformAdmin())) redirect('/')

  const supabase = await createClient()
  const { data: baukaesten } = await supabase
    .from('blueprints').select('key, name, description').order('name')

  return (
    <main className="huelle huelle-schmal">
      <Marke />
      <div className="stapel">
        <div className="stapel-eng">
          <Link href="/admin" className="leise">← Mandanten</Link>
          <h1>Neuer Mandant</h1>
        </div>
        <MandantFormular baukaesten={baukaesten ?? []} anlegen={legeMandantAn} />
      </div>
    </main>
  )
}
