'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Feld } from '@/components/Feld'
import {
  uebersetzungsstand, zuSlug,
  type ContentType, type Fehler, type FieldValues, type RepeaterRow,
} from '@/lib/fields'
import type { Eintrag } from '@/lib/content'

const SPRACHNAMEN: Record<string, string> = {
  de: 'Deutsch', fr: 'Französisch', it: 'Italienisch', en: 'Englisch',
}
const STAND_TEXT = { fehlt: 'fehlt', teilweise: 'angefangen', vollstaendig: 'fertig' } as const

/** Wartezeit nach dem letzten Tastendruck, bevor zwischengespeichert wird. */
const AUTOSAVE_MS = 1500

type Aktion = (entwurf: Entwurf, notiz?: string) =>
  Promise<{ ok: true; gespeichertUm: string } | { ok: false; fehler: Fehler[] }>

export type Entwurf = {
  entryId: string
  tenantSlug: string
  typeKey: string
  fieldValues: FieldValues
  translations: Record<string, { field_values: FieldValues; slug: string | null }>
  publishAt: string | null
  validFrom: string | null
  validUntil: string | null
  slot: string | null
  priority: number
}

export function Editor({
  typ, eintrag, tenantSlug, sprachen, hauptsprache, istLive,
  speichern, veroeffentlichen,
}: {
  typ: ContentType
  eintrag: Eintrag
  tenantSlug: string
  sprachen: string[]
  hauptsprache: string
  istLive: boolean
  speichern: Aktion
  veroeffentlichen: Aktion
}) {
  const [basis, setBasis] = useState<FieldValues>(eintrag.field_values)
  const [uebersetzungen, setUebersetzungen] = useState(() => {
    const start: Entwurf['translations'] = {}
    for (const l of sprachen) {
      start[l] = eintrag.translations[l] ?? { field_values: {}, slug: null }
    }
    return start
  })
  const [zeitplan, setZeitplan] = useState({
    publishAt: eintrag.publish_at, validFrom: eintrag.valid_from,
    validUntil: eintrag.valid_until, slot: eintrag.slot, priority: eintrag.priority,
  })

  const [sprache, setSprache] = useState(hauptsprache)
  const [zustand, setZustand] = useState<'rein' | 'ungespeichert' | 'speichert' | 'gespeichert'>('rein')
  const [fehler, setFehler] = useState<Fehler[]>([])
  const [meldung, setMeldung] = useState<string | null>(null)
  const [laeuft, starte] = useTransition()

  const entwurf: Entwurf = useMemo(() => ({
    entryId: eintrag.id, tenantSlug, typeKey: typ.key,
    fieldValues: basis, translations: uebersetzungen, ...zeitplan,
  }), [eintrag.id, tenantSlug, typ.key, basis, uebersetzungen, zeitplan])

  const entwurfRef = useRef(entwurf)
  entwurfRef.current = entwurf

  /**
   * Automatisches Zwischenspeichern.
   *
   * Speichert immer nur den ENTWURF -- der Live-Stand der Website ändert sich
   * dabei nie. Das ist der Grund, warum entries den Arbeitsstand hält und der
   * veröffentlichte Stand als eigener Schnappschuss daneben liegt.
   */
  useEffect(() => {
    if (zustand !== 'ungespeichert') return
    const uhr = setTimeout(() => {
      setZustand('speichert')
      speichern(entwurfRef.current).then((e) => {
        setZustand(e.ok ? 'gespeichert' : 'ungespeichert')
        if (!e.ok) setFehler(e.fehler)
      })
    }, AUTOSAVE_MS)
    return () => clearTimeout(uhr)
  }, [zustand, speichern])

  // Warnung beim Verlassen mit ungespeicherten Änderungen.
  useEffect(() => {
    if (zustand === 'rein' || zustand === 'gespeichert') return
    const warnung = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warnung)
    return () => window.removeEventListener('beforeunload', warnung)
  }, [zustand])

  const aendere = useCallback(() => {
    setZustand('ungespeichert')
    setMeldung(null)
  }, [])

  const setzeBasis = (key: string, wert: unknown) => {
    setBasis((b) => ({ ...b, [key]: wert }))
    aendere()
  }

  const setzeUebersetzung = (key: string, wert: unknown) => {
    setUebersetzungen((u) => ({
      ...u,
      [sprache]: { ...u[sprache], field_values: { ...u[sprache].field_values, [key]: wert } },
    }))
    aendere()
  }

  const setzeZeilenUebersetzung = (feldKey: string, zeilenId: string, unterKey: string, wert: unknown) => {
    setUebersetzungen((u) => {
      const feld = (u[sprache].field_values[feldKey] ?? {}) as Record<string, FieldValues>
      return {
        ...u,
        [sprache]: {
          ...u[sprache],
          field_values: {
            ...u[sprache].field_values,
            [feldKey]: { ...feld, [zeilenId]: { ...(feld[zeilenId] ?? {}), [unterKey]: wert } },
          },
        },
      }
    })
    aendere()
  }

  const jetztVeroeffentlichen = () => {
    setFehler([])
    starte(async () => {
      const e = await veroeffentlichen(entwurfRef.current)
      if (e.ok) {
        setZustand('gespeichert')
        setMeldung('Veröffentlicht. Die Änderung ist jetzt auf deiner Website.')
      } else {
        setFehler(e.fehler)
      }
    })
  }

  const istHaupt = sprache === hauptsprache
  const werte = uebersetzungen[sprache]?.field_values ?? {}
  const hauptWerte = uebersetzungen[hauptsprache]?.field_values ?? {}

  return (
    <div className="stapel">
      {/* Sprachumschalter gehört in den Editor, nicht in die Einstellungen. */}
      {sprachen.length > 1 && (
        <div className="sprachleiste" role="tablist" aria-label="Sprache">
          {sprachen.map((l) => {
            const stand = uebersetzungsstand(typ.fields, basis, uebersetzungen[l]?.field_values ?? {})
            return (
              <button
                key={l} role="tab" aria-selected={l === sprache}
                className={l === sprache ? 'sprache sprache-an' : 'sprache'}
                onClick={() => setSprache(l)}
              >
                {SPRACHNAMEN[l] ?? l}
                {l !== hauptsprache && <span className={`punkt punkt-${stand}`} aria-hidden="true" />}
                <span className="visuell-versteckt">
                  {l === hauptsprache ? 'Hauptsprache' : `Übersetzung ${STAND_TEXT[stand]}`}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {!istHaupt && (
        <div className="hinweis">
          Du bearbeitest die Übersetzung. Leere Felder zeigen automatisch den Text
          auf {SPRACHNAMEN[hauptsprache]} — deine Website bleibt nie leer.
        </div>
      )}

      {typ.fields.map((feld) => {
        // Nicht übersetzbare Felder erscheinen nur in der Hauptsprache. Sonst
        // pflegt der Kunde denselben Preis viermal.
        if (!feld.translatable && feld.type !== 'repeater') {
          return istHaupt
            ? <Feld key={feld.id} feld={feld} wert={basis[feld.key]}
                    onChange={(w) => setzeBasis(feld.key, w)} />
            : null
        }

        if (feld.type === 'repeater') {
          const zeilen = Array.isArray(basis[feld.key]) ? (basis[feld.key] as RepeaterRow[]) : []
          const uebersetzbare = feld.children.filter((k) => k.translatable)

          return (
            <section key={feld.id} className="karte">
              <h2>{feld.label}</h2>
              {istHaupt ? (
                <Feld feld={feld} wert={basis[feld.key]} onChange={(w) => setzeBasis(feld.key, w)} />
              ) : (
                <p className="leise">
                  Zeilen und Preise werden auf {SPRACHNAMEN[hauptsprache]} gepflegt.
                  Hier übersetzt du nur die Texte.
                </p>
              )}

              {uebersetzbare.length > 0 && zeilen.length > 0 && (
                <div className="stapel-eng">
                  {zeilen.map((zeile, i) => {
                    const uebersetzt = (werte[feld.key] ?? {}) as Record<string, FieldValues>
                    const hauptZeile = (hauptWerte[feld.key] ?? {}) as Record<string, FieldValues>
                    return (
                      <div key={zeile._id} className="zeile-karte">
                        <span className="leise mono">Zeile {i + 1}</span>
                        {uebersetzbare.map((kind) => (
                          <Feld
                            key={kind.id} feld={kind}
                            wert={uebersetzt[zeile._id]?.[kind.key] ?? ''}
                            vorlage={istHaupt ? undefined : hauptZeile[zeile._id]?.[kind.key]}
                            onChange={(w) => setzeZeilenUebersetzung(feld.key, zeile._id, kind.key, w)}
                          />
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )
        }

        return (
          <Feld
            key={feld.id} feld={feld} wert={werte[feld.key] ?? ''}
            vorlage={istHaupt ? undefined : hauptWerte[feld.key]}
            onChange={(w) => setzeUebersetzung(feld.key, w)}
          />
        )
      })}

      {typ.hasSlug && (
        <div className="stapel-eng">
          <label htmlFor="slug">Web-Adresse ({SPRACHNAMEN[sprache]})</label>
          <p className="leise">
            Erscheint in der Adresszeile. Änderst du sie, bleibt die alte Adresse
            als Weiterleitung bestehen.
          </p>
          <input
            id="slug" type="text"
            value={uebersetzungen[sprache]?.slug ?? ''}
            placeholder={zuSlug(String(werte[typ.fields[0]?.key] ?? '')) || 'mein-beitrag'}
            onChange={(e) => {
              setUebersetzungen((u) => ({ ...u, [sprache]: { ...u[sprache], slug: zuSlug(e.target.value) } }))
              aendere()
            }}
          />
        </div>
      )}

      <Zeitsteuerung typ={typ} wert={zeitplan} onChange={(z) => { setZeitplan(z); aendere() }} />

      {fehler.length > 0 && (
        <div className="hinweis warn" role="alert">
          <strong>Das fehlt noch:</strong>
          <ul>{fehler.map((f, i) => <li key={i}>{f.meldung}</li>)}</ul>
        </div>
      )}
      {meldung && <div className="hinweis gut" role="status">{meldung}</div>}

      {/* Trennung zwischen gespeichert und veröffentlicht: die wichtigste
          Unterscheidung der ganzen Oberfläche. */}
      <div className="leiste">
        <span className="leise" aria-live="polite">
          {zustand === 'speichert' && 'Wird gespeichert …'}
          {zustand === 'gespeichert' && 'Entwurf gespeichert'}
          {zustand === 'ungespeichert' && 'Nicht gespeicherte Änderungen'}
          {zustand === 'rein' && (istLive ? 'Auf der Website' : 'Entwurf')}
        </span>
        <button type="button" onClick={jetztVeroeffentlichen} disabled={laeuft}>
          {laeuft ? 'Wird veröffentlicht …' : 'Veröffentlichen'}
        </button>
      </div>
    </div>
  )
}

/**
 * Zeitsteuerung in Klartext.
 *
 * "Gültig ab" statt publish_at -- der Kunde soll nicht lernen müssen, wie die
 * Spalten heissen.
 */
function Zeitsteuerung({
  typ, wert, onChange,
}: {
  typ: ContentType
  wert: { publishAt: string | null; validFrom: string | null; validUntil: string | null; slot: string | null; priority: number }
  onChange: (w: typeof wert) => void
}) {
  const feld = (k: keyof typeof wert) =>
    typeof wert[k] === 'string' ? (wert[k] as string).slice(0, 16) : ''

  return (
    <details className="karte">
      <summary><strong>Zeitsteuerung</strong></summary>
      <div className="stapel-eng" style={{ marginTop: 12 }}>
        <p className="leise">
          Alle Zeiten in Schweizer Zeit. Leer lassen heisst: sofort und dauerhaft.
        </p>

        <label htmlFor="valid_from">Sichtbar ab</label>
        <input id="valid_from" type="datetime-local" value={feld('validFrom')}
               onChange={(e) => onChange({ ...wert, validFrom: e.target.value || null })} />

        <label htmlFor="valid_until">Sichtbar bis</label>
        <input id="valid_until" type="datetime-local" value={feld('validUntil')}
               onChange={(e) => onChange({ ...wert, validUntil: e.target.value || null })} />

        {typ.supportsSlots && (
          <>
            <label htmlFor="slot">Platz</label>
            <p className="leise">
              Mehrere Einträge können sich denselben Platz teilen — sichtbar ist
              dann der mit der höchsten Rangzahl, der gerade gültig ist. So löst
              zum Beispiel eine Saisonkarte die reguläre Karte ab und gibt sie
              danach automatisch wieder frei.
            </p>
            <input id="slot" type="text" value={wert.slot ?? ''} placeholder="z.B. vorspeisen"
                   onChange={(e) => onChange({ ...wert, slot: e.target.value || null })} />

            <label htmlFor="priority">Rangzahl</label>
            <input id="priority" type="number" value={wert.priority}
                   onChange={(e) => onChange({ ...wert, priority: Number(e.target.value) || 0 })} />
          </>
        )}
      </div>
    </details>
  )
}
