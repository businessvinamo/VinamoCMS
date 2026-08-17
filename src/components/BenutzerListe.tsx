'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { AdminBenutzerErgebnis } from '@/app/admin/benutzer/actions'
import { Rechte } from '@/components/Rechte'

export type Mitgliedschaft = {
  tenantId: string
  tenantName: string
  darfBenutzerVerwalten: boolean
  erlaubteTypen: string[] | null
  verfuegbareTypen: { id: string; name: string }[]
}

export type Benutzer = {
  id: string
  email: string
  istAdmin: boolean
  binIchSelbst: boolean
  wechselOffen: boolean
  zuletzt: string | null
  mitgliedschaften: Mitgliedschaft[]
}

const datum = new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium', timeZone: 'Europe/Zurich' })

export function BenutzerListe({
  benutzer, setzeAdminrolle, setzePasswortNeu, loescheBenutzer, setzeRechte,
}: {
  benutzer: Benutzer[]
  setzeAdminrolle: (userId: string, istAdmin: boolean) => Promise<AdminBenutzerErgebnis>
  setzePasswortNeu: (userId: string) => Promise<AdminBenutzerErgebnis>
  loescheBenutzer: (userId: string) => Promise<AdminBenutzerErgebnis>
  setzeRechte: (
    tenantId: string, userId: string, darfVerwalten: boolean, typen: string[] | null,
  ) => Promise<AdminBenutzerErgebnis>
}) {
  const router = useRouter()
  const [ergebnis, setErgebnis] = useState<AdminBenutzerErgebnis | null>(null)
  const [laeuft, starte] = useTransition()

  const tun = (fn: () => Promise<AdminBenutzerErgebnis>) =>
    starte(async () => { setErgebnis(await fn()); router.refresh() })

  return (
    <div className="stapel">
      {ergebnis?.ok && ergebnis.startpasswort && (
        <div className="karte" style={{ borderColor: 'var(--violett)' }}>
          <h2>Neues Startpasswort</h2>
          <p className="leise">
            Einmalig sichtbar. Beim nächsten Anmelden muss ein eigenes gewählt werden.
          </p>
          <div className="zugangsdaten">
            <span className="leise">Adresse</span><code>{ergebnis.email}</code>
            <span className="leise">Passwort</span>
            <code className="startpasswort">{ergebnis.startpasswort}</code>
          </div>
        </div>
      )}
      {ergebnis && !(ergebnis.ok && ergebnis.startpasswort) && (
        <div className={ergebnis.ok ? 'hinweis gut' : 'hinweis warn'} role="status">
          {ergebnis.meldung}
        </div>
      )}

      <ul className="liste">
        {benutzer.map((b) => (
          <li key={b.id} className="karte">
            <div className="kopfzeile">
              <span className="stapel-eng" style={{ minWidth: 0 }}>
                <strong className="umbruch">{b.email}</strong>
                <span className="leise">
                  {b.binIchSelbst && 'Das bist du · '}
                  {b.zuletzt ? `zuletzt ${datum.format(new Date(b.zuletzt))}` : 'noch nie angemeldet'}
                  {b.wechselOffen && ' · Passwortwechsel offen'}
                </span>
              </span>
              {b.istAdmin && <span className="marke-rolle admin">Admin</span>}
            </div>

            {b.mitgliedschaften.length === 0 ? (
              <p className="leise">Keinem Mandanten zugeordnet.</p>
            ) : (
              b.mitgliedschaften.map((m) => (
                <Rechte
                  key={m.tenantId} mitgliedschaft={m} userId={b.id}
                  gesperrt={laeuft} speichern={setzeRechte}
                  nachSpeichern={(e) => { setErgebnis(e); router.refresh() }}
                />
              ))
            )}

            <div className="knopfzeile">
              <button type="button" className="knopf-zweit" disabled={laeuft}
                      onClick={() => tun(() => setzePasswortNeu(b.id))}>
                Passwort zurücksetzen
              </button>
              <button type="button" className="knopf-zweit" disabled={laeuft || b.binIchSelbst}
                      onClick={() => tun(() => setzeAdminrolle(b.id, !b.istAdmin))}>
                {b.istAdmin ? 'Adminrechte entziehen' : 'Zum Admin machen'}
              </button>
              <button type="button" className="knopf-klein knopf-weg" disabled={laeuft || b.binIchSelbst}
                      onClick={() => {
                        if (!confirm(`Konto ${b.email} endgültig löschen?`)) return
                        tun(() => loescheBenutzer(b.id))
                      }}>
                Löschen
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
