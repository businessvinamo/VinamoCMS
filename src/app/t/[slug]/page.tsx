import Link from 'next/link'
import { Kopfzeile } from '@/components/Kopfzeile'
import { createClient } from '@/lib/supabase/server'
import { isPlatformAdmin, listMemberships, requireTenant, requireUser } from '@/lib/tenant'
import { ladeBearbeitbareInhaltstypen, ladeInhaltsuebersicht, type Typstand } from '@/lib/content'
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

function mehrzahl(anzahl: number, einzahl: string, mehrzahl: string) {
  return `${anzahl} ${anzahl === 1 ? einzahl : mehrzahl}`
}

/**
 * Was an einer Zeile rechts steht.
 *
 * Nur was der Kunde beantworten können muss, ohne hineinzuklicken: Liegt hier
 * etwas? Habe ich etwas angefangen und nicht veröffentlicht? Wartet etwas auf
 * seinen Termin?
 *
 * „Auf der Website" statt „live" und „Entwurf" statt „unpublished" -- dieselben
 * Wörter wie in der Eintragsliste. Zwei Namen für denselben Zustand sind zwei
 * Zustände, sobald jemand am Telefon danach fragt.
 */
function Stand({ stand }: { stand: Typstand }) {
  if (stand.gesamt === 0) {
    return <span className="leise">Noch nichts angelegt</span>
  }
  return (
    <>
      {/*
        „3 auf der Website" und nicht „3 Einträge auf der Website": Wovon die
        Rede ist, steht als Titel derselben Zeile daneben. Das Substantiv brach
        auf dem Handy neben einer Marke in die zweite Zeile um -- für ein Wort,
        das nichts hinzufügt.
      */}
      <span className="leise">
        {stand.live > 0 ? `${stand.live} auf der Website` : 'Nichts auf der Website'}
      </span>
      {stand.entwurf > 0 && (
        <span className="marke-rolle zustand-entwurf">
          {mehrzahl(stand.entwurf, 'Entwurf', 'Entwürfe')}
        </span>
      )}
      {stand.wartend > 0 && (
        <span className="marke-rolle zustand-geplant">{stand.wartend} geplant</span>
      )}
    </>
  )
}

/**
 * Mandanten-Startseite. Die Seite, auf der der Kunde landet.
 *
 * Sie zeigt ihm zuerst, wofür er gekommen ist -- seine Inhalte. Alles Übrige
 * steht darunter, und was ihn nichts angeht, steht gar nicht da:
 *
 *   * Die Funktionsschalter (content_editor, repeaters, …) sind Vinamo-Interna.
 *   * Die Kennung des Mandanten steht in der Lese-API, nicht im Alltag der
 *     Wirtin. Sie bleibt für den Admin sichtbar, weil er sie braucht.
 *   * „Alle Websites" erscheint nur, wenn es mehr als eine gibt.
 *   * Den Knopf zum Verwalten der Zugänge sieht nur, wer das Recht dazu hat.
 *
 * ZUR DARSTELLUNG DER INHALTSLISTE
 * --------------------------------
 * Vorher war jeder Typ eine eigene Karte, und Gruppen bekamen zusätzlich einen
 * Strich am linken Rand mit Einzug. Damit hatte die Seite VIER verschiedene
 * linke Kanten übereinander -- eingerückt, bündig, eingerückt, bündig. Die
 * Gruppierung war zwar korrekt, sah aber nach Unordnung aus.
 *
 * Neu ist eine Gruppe EINE Tafel mit mehreren Zeilen. Die Zugehörigkeit zeigt
 * der gemeinsame Rahmen, nicht ein Einzug; alle Tafeln beginnen an derselben
 * Kante. Ein Typ ohne Gruppe ist dieselbe Tafel mit einer Zeile -- kein
 * Sonderfall in der Darstellung, nur ein kürzerer Inhalt.
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

  // Erst hier, weil die Kennungen der Typen vorher nicht feststehen.
  const uebersicht = await ladeInhaltsuebersicht(tenant.id, typen.map((t) => t.id))

  type Konto = { user_id: string; email: string | null }
  const zugaenge = ((konten ?? []) as Konto[])
    .map((k) => ({ id: k.user_id, email: k.email ?? 'unbekannt' }))
    .sort((a, b) => a.email.localeCompare(b.email))

  const mehrereWebsites = istAdmin || mitgliedschaften.length > 1
  const offeneEntwuerfe = [...uebersicht.values()].reduce((s, z) => s + z.entwurf, 0)

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

        <section className="stapel">
          <div className="abschnittskopf">
            <h2>Inhalte pflegen</h2>
            {offeneEntwuerfe > 0 && (
              <span className="leise">
                {mehrzahl(offeneEntwuerfe, 'Entwurf', 'Entwürfe')} noch nicht veröffentlicht
              </span>
            )}
          </div>

          {typen.length === 0 ? (
            <p className="leise">
              Für diese Website ist noch kein Inhaltstyp freigeschaltet.
            </p>
          ) : (
            gruppiere(typen).map((gruppe) => (
              <div className="tafel" key={gruppe.titel ?? gruppe.typen[0].id}>
                {gruppe.titel && <p className="tafel-band">{gruppe.titel}</p>}
                {gruppe.typen.map((t) => (
                  <Link key={t.id} href={`/t/${tenant.slug}/${t.key}`} className="tafel-zeile">
                    <span className="tafel-text">
                      <strong>{t.namePlural}</strong>
                      {t.description && <span className="leise">{t.description}</span>}
                    </span>
                    <span className="tafel-rechts">
                      <Stand stand={uebersicht.get(t.id) ?? {
                        gesamt: 0, live: 0, entwurf: 0, wartend: 0,
                      }} />
                      <span aria-hidden="true" className="tafel-pfeil">→</span>
                    </span>
                  </Link>
                ))}
              </div>
            ))
          )}
        </section>

        <section className="stapel">
          <h2>Website und Zugang</h2>

          <div className="tafel">
            <Link href={`/t/${tenant.slug}/protokoll`} className="tafel-zeile">
              <span className="tafel-text">
                <strong>Protokoll</strong>
                <span className="leise">
                  Wer wann was veröffentlicht hat — und ob die Website danach
                  aktualisiert wurde.
                </span>
              </span>
              <span className="tafel-rechts">
                <span aria-hidden="true" className="tafel-pfeil">→</span>
              </span>
            </Link>

            {darfVerwalten === true ? (
              <Link href={`/t/${tenant.slug}/benutzer`} className="tafel-zeile">
                <span className="tafel-text">
                  <strong>Zugänge</strong>
                  <span className="leise">
                    {zugaenge.map((z) => z.email).join(', ') || 'Noch niemand freigeschaltet.'}
                  </span>
                </span>
                <span className="tafel-rechts">
                  <span className="leise">
                    {mehrzahl(zugaenge.length, 'Person', 'Personen')}
                  </span>
                  <span aria-hidden="true" className="tafel-pfeil">→</span>
                </span>
              </Link>
            ) : (
              <div className="tafel-zeile">
                <span className="tafel-text">
                  <strong>Zugänge</strong>
                  <span className="leise">
                    {zugaenge.map((z) => z.email).join(', ') || 'Noch niemand freigeschaltet.'}
                  </span>
                </span>
                <span className="tafel-rechts">
                  <span className="leise">
                    {mehrzahl(zugaenge.length, 'Person', 'Personen')}
                  </span>
                </span>
              </div>
            )}

            <div className="tafel-zeile">
              <span className="tafel-text">
                <strong>Sprachen</strong>
                <span className="leise">
                  Fehlt eine Übersetzung, zeigt die Website automatisch die Hauptsprache.
                </span>
              </span>
              <span className="tafel-rechts">
                <span className="leise">
                  {tenant.locales.map((l) => SPRACHNAMEN[l] ?? l).join(', ')}
                </span>
                <span className="marke-rolle">
                  {SPRACHNAMEN[tenant.default_locale] ?? tenant.default_locale} zuerst
                </span>
              </span>
            </div>
          </div>
        </section>

        {istAdmin && (
          <section className="stapel">
            <h2>Nur für Vinamo</h2>
            <div className="tafel">
              <Link href={`/admin/${tenant.slug}`} className="tafel-zeile">
                <span className="tafel-text">
                  <strong>Im Admin verwalten</strong>
                  <span className="leise">
                    Inhaltstypen freischalten, Funktionen ein- und ausschalten,
                    Website stilllegen. Nur du siehst diesen Bereich.
                  </span>
                </span>
                <span className="tafel-rechts">
                  <span aria-hidden="true" className="tafel-pfeil">→</span>
                </span>
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
