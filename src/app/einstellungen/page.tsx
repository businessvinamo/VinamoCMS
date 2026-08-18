import Link from 'next/link'
import { Kopfzeile } from '@/components/Kopfzeile'
import { PasswortAendern } from '@/components/PasswortAendern'
import { isPlatformAdmin, listMemberships, requireUser } from '@/lib/tenant'
import { aendereEigenesPasswort } from './actions'

export const dynamic = 'force-dynamic'

/** Eigene Einstellungen. Für jeden Angemeldeten, unabhängig von der Rolle. */
export default async function Einstellungen() {
  const user = await requireUser()
  const [mitgliedschaften, istAdmin] = await Promise.all([
    listMemberships(), isPlatformAdmin(),
  ])

  return (
    <>
      <Kopfzeile email={user.email} />
      <main className="huelle huelle-schmal">
        <div className="stapel">
          <div className="stapel-eng">
            <Link href="/" className="leise">← Deine Websites</Link>
            <h1>Einstellungen</h1>
          </div>

          <div className="karte">
            <h2>Dein Konto</h2>
            <dl className="angaben">
              <dt>E-Mail-Adresse</dt>
              <dd className="umbruch">{user.email}</dd>
              <dt>Rolle</dt>
              <dd>{istAdmin ? 'Admin — Zugriff auf alle Mandanten' : 'Zugang zu deinen Websites'}</dd>
              <dt>{mitgliedschaften.length === 1 ? 'Website' : 'Websites'}</dt>
              <dd>
                {mitgliedschaften.length === 0
                  ? 'Noch keine zugeordnet'
                  : mitgliedschaften.map((m) => m.tenant.name).join(', ')}
              </dd>
            </dl>
            <p className="leise">
              Deine E-Mail-Adresse kannst du nicht selbst ändern — melde dich
              dafür bei Vinamo.
            </p>
          </div>

          <PasswortAendern aendern={aendereEigenesPasswort} />
        </div>
      </main>
    </>
  )
}
