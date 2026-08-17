import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Marke } from '@/components/Marke'
import { isPlatformAdmin, listMemberships, requireUser } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/**
 * Mandantenübersicht. Wer genau einen Mandanten hat -- also fast jeder Kunde --
 * sieht diese Seite nie und landet direkt in seinem Mandanten. Der Wechsler ist
 * für Treuhänder und Agenturpartner da, nicht für die Wirtin.
 */
export default async function Uebersicht({
  searchParams,
}: {
  searchParams: Promise<{ unbekannt?: string }>
}) {
  const user = await requireUser()
  const { unbekannt } = await searchParams
  const [mitgliedschaften, istAdmin] = await Promise.all([
    listMemberships(),
    isPlatformAdmin(),
  ])

  if (mitgliedschaften.length === 1 && !unbekannt && !istAdmin) {
    redirect(`/t/${mitgliedschaften[0].tenant.slug}`)
  }

  return (
    <main className="huelle">
      <Marke />
      <div className="stapel">
        <div className="stapel-eng">
          <h1>Deine Websites</h1>
          <p className="leise">Angemeldet als {user.email}</p>
        </div>

        {unbekannt && (
          <div className="hinweis warn">
            Diese Website gibt es nicht oder du hast keinen Zugriff darauf.
          </div>
        )}

        {istAdmin && (
          <div className="hinweis gut">
            Du bist als Vinamo-Administrator angemeldet und siehst alle Mandanten.
          </div>
        )}

        {mitgliedschaften.length === 0 ? (
          <div className="karte">
            <h2>Noch nichts freigeschaltet</h2>
            <p className="leise">
              Dein Konto ist angelegt, aber noch keiner Website zugeordnet. Melde dich
              bei Vinamo, dann schalten wir dich frei.
            </p>
          </div>
        ) : (
          <ul className="liste">
            {mitgliedschaften.map(({ tenant, role }) => (
              <li key={tenant.id}>
                <Link href={`/t/${tenant.slug}`} className="karte karte-klick">
                  <span className="stapel-eng">
                    <strong>{tenant.name}</strong>
                    <span className="leise mono">{tenant.slug}</span>
                  </span>
                  <span className="marke-rolle">
                    {role === 'owner' ? 'Besitzer' : 'Redaktion'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
