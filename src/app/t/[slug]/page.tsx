import Link from 'next/link'
import { Kopfzeile } from '@/components/Kopfzeile'
import { createClient } from '@/lib/supabase/server'
import { isPlatformAdmin, listMemberships, requireTenant, requireUser } from '@/lib/tenant'
import { ladeBearbeitbareInhaltstypen } from '@/lib/content'
import type { ContentType } from '@/lib/fields'

export const dynamic = 'force-dynamic'

const SPRACHNAMEN: Record<string, string> = {
  de: 'Deutsch', fr: 'Französisch', it: 'Italienisch', en: 'Englisch',
}

/**
 * Inhaltstypen zu Gruppen zusammenfassen.
 *
 * Die Reihenfolge kommt aus der Liste, nicht aus einer Sortierung hier: Wer die
 * Positionen im Admin ändert, soll die Übersicht ändern. Eine Gruppe steht dort,
 * wo ihr erstes Mitglied steht -- damit landet sie nie hinter einem Typ, der
 * eigentlich nach ihr kommt.
 *
 * Typen ohne Gruppe stehen für sich und bekommen keine Überschrift. Zwei
 * Einträge mit derselben Beschriftung, die nicht nebeneinander liegen, ergeben
 * bewusst ZWEI Gruppen -- die Reihenfolge gewinnt, sonst würde ein Typ aus der
 * Mitte der Liste nach oben gerissen.
 */
function gruppiere(typen: ContentType[]): { titel: string | null; typen: ContentType[] }[] {
  const gruppen: { titel: string | null; typen: ContentType[] }[] = []
  for (const typ of typen) {
    const letzte = gruppen[gruppen.length - 1]
    if (typ.groupLabel && letzte?.titel === typ.groupLabel) letzte.typen.push(typ)
    else gruppen.push({ titel: typ.groupLabel ?? null, typen: [typ] })
  }
  return gruppen
}

/**
 * Mandanten-Startseite. Die Seite, auf der der Kunde landet.
 *
 * Sie zeigt ihm zuerst, wofür er gekommen ist -- seine Inhalte. Alles Übrige
 * steht darunter, und was ihn nichts angeht, steht gar nicht da:
 *
 *   * Die Funktionsschalter (content_editor, repeaters, …) sind Vinamo-Interna.
 *     Sie standen hier als nackte Schlüssel und sagten dem Kunden nichts.
 *     Verwaltet werden sie ohnehin unter /admin/<kennung>, mit Beschreibung.
 *   * Die Kennung des Mandanten steht in der Lese-API, nicht im Alltag der
 *     Wirtin. Sie bleibt für den Admin sichtbar, weil er sie braucht.
 *   * „Alle Websites" erscheint nur, wenn es mehr als eine gibt. Ein Kunde mit
 *     genau einer Website wird von der Übersicht ohnehin direkt hierher
 *     geleitet -- ein Link zurück auf eine Seite, die er nie sieht, verwirrt.
 *   * Zugänge standen als abgeschnittene Benutzerkennungen da („a4d16212…").
 *     Jetzt stehen dort die E-Mail-Adressen, und den Knopf zum Verwalten sieht
 *     nur, wer das Recht dazu hat.
 */
export default async function MandantSeite({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const nutzer = await requireUser()

  const { tenant } = await requireTenant(slug)
  const istAdmin = await isPlatformAdmin()
  const supabase = await createClient()

  const [{ data: konten }, { data: darfVerwalten }, typen, mitgliedschaften] =
    await Promise.all([
      supabase.rpc('tenant_member_accounts', { p_tenant_id: tenant.id }),
      supabase.rpc('can_manage_tenant', { p_tenant_id: tenant.id }),
      ladeBearbeitbareInhaltstypen(tenant.id),
      listMemberships(),
    ])

  type Konto = { user_id: string; email: string | null }
  const zugaenge = ((konten ?? []) as Konto[])
    .map((k) => ({ id: k.user_id, email: k.email ?? 'unbekannt' }))
    .sort((a, b) => a.email.localeCompare(b.email))

  const mehrereWebsites = istAdmin || mitgliedschaften.length > 1

  return (
    <main className="huelle">
      <Kopfzeile email={nutzer.email} />
      <div className="stapel">
        <div className="stapel-eng">
          {mehrereWebsites && (
            <Link href="/" className="leise">← Alle Websites</Link>
          )}
          <h1>{tenant.name}</h1>
          {istAdmin && <p className="leise mono">{tenant.slug}</p>}
        </div>

        {!tenant.is_active && (
          <div className="hinweis warn">
            Diese Website ist stillgelegt. Inhalte lassen sich ansehen, aber nicht ändern.
          </div>
        )}

        <div className="stapel">
          <h2>Inhalte pflegen</h2>
          {typen.length === 0 ? (
            <p className="leise">
              Für diese Website ist noch kein Inhaltstyp freigeschaltet.
            </p>
          ) : (
            gruppiere(typen).map((gruppe) => (
              <div key={gruppe.titel ?? gruppe.typen[0].id}
                   className={gruppe.titel ? 'stapel-eng gruppe' : 'stapel-eng'}>
                {gruppe.titel && <h3 className="gruppentitel">{gruppe.titel}</h3>}
                <ul className="liste">
                  {gruppe.typen.map((t) => (
                    <li key={t.id}>
                      <Link href={`/t/${tenant.slug}/${t.key}`} className="karte karte-klick">
                        <span className="stapel-eng">
                          <strong>{t.namePlural}</strong>
                          {t.description && <span className="leise">{t.description}</span>}
                        </span>
                        <span aria-hidden="true" className="leise">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="karte">
          <h2>Protokoll</h2>
          <p className="leise">
            Wer wann was veröffentlicht hat — und ob die Website danach
            aktualisiert wurde.
          </p>
          <Link href={`/t/${tenant.slug}/protokoll`} className="aktion">Protokoll ansehen</Link>
        </div>

        <div className="karte">
          <h2>Zugänge</h2>
          <ul className="liste">
            {zugaenge.map((z) => (
              <li key={z.id} className="zeile">
                <span className="umbruch">{z.email}</span>
                {z.id === nutzer.id && <span className="marke-rolle">Das bist du</span>}
              </li>
            ))}
            {zugaenge.length === 0 && (
              <li className="leise">Noch niemand freigeschaltet.</li>
            )}
          </ul>
          {darfVerwalten === true && (
            <Link href={`/t/${tenant.slug}/benutzer`} className="aktion">Zugänge verwalten</Link>
          )}
        </div>

        <div className="karte">
          <h2>Sprachen</h2>
          <ul className="liste">
            {tenant.locales.map((l) => (
              <li key={l} className="zeile">
                <span>{SPRACHNAMEN[l] ?? l}</span>
                {l === tenant.default_locale && (
                  <span className="marke-rolle">Hauptsprache</span>
                )}
              </li>
            ))}
          </ul>
          <p className="leise">
            Fehlt eine Übersetzung, zeigt die Website automatisch die Hauptsprache.
          </p>
        </div>

        {istAdmin && (
          <div className="karte">
            <h2>Verwaltung</h2>
            <p className="leise">
              Inhaltstypen freischalten, Funktionen ein- und ausschalten,
              Website stilllegen. Nur du siehst diese Karte.
            </p>
            <Link href={`/admin/${tenant.slug}`} className="aktion">
              Im Admin verwalten
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
