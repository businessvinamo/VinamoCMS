'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { MandantErgebnis } from '@/app/admin/actions'

const SPRACHEN = [
  { code: 'de', name: 'Deutsch' }, { code: 'fr', name: 'Französisch' },
  { code: 'it', name: 'Italienisch' }, { code: 'en', name: 'Englisch' },
]

/** Aus einem Kundennamen einen Kennungs-Vorschlag machen. */
function zuKennung(name: string) {
  return name.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

export function MandantFormular({
  baukaesten, anlegen,
}: {
  baukaesten: { key: string; name: string; description: string }[]
  anlegen: (formular: FormData) => Promise<MandantErgebnis>
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [kennung, setKennung] = useState('')
  const [kennungBearbeitet, setKennungBearbeitet] = useState(false)
  const [sprachen, setSprachen] = useState<string[]>(['de'])
  const [haupt, setHaupt] = useState('de')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, starte] = useTransition()

  const umschalten = (code: string) => {
    setSprachen((s) => {
      const neu = s.includes(code) ? s.filter((x) => x !== code) : [...s, code]
      // Die Hauptsprache muss aktiv bleiben, sonst entsteht ein Mandant, dessen
      // Fallback es gar nicht gibt -- und dann bleibt die Website leer.
      if (!neu.includes(haupt) && neu.length > 0) setHaupt(neu[0])
      return neu
    })
  }

  return (
    <form
      className="stapel"
      action={(f) => starte(async () => {
        setFehler(null)
        const e = await anlegen(f)
        if (e.ok) router.push(`/admin/${e.slug}`)
        else setFehler(e.meldung)
      })}
    >
      <div className="stapel-eng">
        <label htmlFor="name">Name des Kunden</label>
        <input id="name" name="name" type="text" required value={name}
               placeholder="Restaurant Sonne"
               onChange={(e) => {
                 setName(e.target.value)
                 if (!kennungBearbeitet) setKennung(zuKennung(e.target.value))
               }} />
      </div>

      <div className="stapel-eng">
        <label htmlFor="slug">Kennung</label>
        <p className="leise">
          Steht in der Adresse des Admin und in der Lese-API. Lässt sich später
          nicht mehr gefahrlos ändern — bestehende Links würden brechen.
        </p>
        <input id="slug" name="slug" type="text" required value={kennung}
               pattern="[a-z0-9]+(-[a-z0-9]+)*"
               onChange={(e) => { setKennung(e.target.value); setKennungBearbeitet(true) }} />
      </div>

      <fieldset className="karte" style={{ border: '1px solid var(--linie)' }}>
        <legend className="leise">Sprachen</legend>
        <div className="chips">
          {SPRACHEN.map((s) => (
            <label key={s.code} className={sprachen.includes(s.code) ? 'chip chip-an' : 'chip'}>
              <input type="checkbox" name={`sprache_${s.code}`} className="visuell-versteckt"
                     checked={sprachen.includes(s.code)} onChange={() => umschalten(s.code)} />
              {s.name}
            </label>
          ))}
        </div>

        <div className="stapel-eng" style={{ marginTop: 12 }}>
          <label htmlFor="default_locale">Hauptsprache</label>
          <p className="leise">
            Fehlt eine Übersetzung, zeigt die Website diese Sprache. Sie lässt
            sich später nicht mehr ändern.
          </p>
          <select id="default_locale" name="default_locale" value={haupt}
                  onChange={(e) => setHaupt(e.target.value)}>
            {SPRACHEN.filter((s) => sprachen.includes(s.code)).map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        </div>
      </fieldset>

      <div className="stapel-eng">
        <label htmlFor="blueprint">Branche</label>
        <p className="leise">
          Schaltet die passenden Inhaltstypen frei. Lässt sich danach jederzeit
          anpassen.
        </p>
        <select id="blueprint" name="blueprint" defaultValue="">
          <option value="">Ohne — Inhaltstypen einzeln wählen</option>
          {baukaesten.map((b) => (
            <option key={b.key} value={b.key}>{b.name} · {b.description}</option>
          ))}
        </select>
      </div>

      {fehler && <div className="hinweis warn" role="alert">{fehler}</div>}

      <button type="submit" disabled={laeuft || sprachen.length === 0}>
        {laeuft ? 'Wird angelegt …' : 'Mandant anlegen'}
      </button>
    </form>
  )
}
