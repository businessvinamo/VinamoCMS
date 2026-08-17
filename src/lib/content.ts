import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { ContentType, Field, FieldValues } from '@/lib/fields'

type FeldZeile = {
  id: string; key: string; type: Field['type']; label: string; help: string
  required: boolean; translatable: boolean; config: Record<string, unknown>
  position: number; parent_field_id: string | null; content_type_id: string
}

/**
 * Inhaltstypen eines Mandanten inklusive Felder und Mandanten-Abweichungen.
 *
 * Abweichungen sind ausschliesslich subtraktiv und kosmetisch: ausblenden,
 * umbenennen, Pflicht lockern. Neue Felder gibt es nur global. Die Erlaubnisliste
 * steht hier im Code und nicht im Ermessen der Oberfläche -- sonst bekämen vier
 * Kunden vier Schemata.
 */
export async function ladeInhaltstypen(tenantId: string): Promise<ContentType[]> {
  const supabase = await createClient()

  const [{ data: aktiv }, { data: typen }, { data: felder }, { data: abweichungen }] =
    await Promise.all([
      supabase.from('tenant_content_types').select('content_type_id, position').eq('tenant_id', tenantId),
      supabase.from('content_types').select('*'),
      supabase.from('fields').select('*').order('position'),
      supabase.from('tenant_field_overrides').select('*').eq('tenant_id', tenantId),
    ])

  const aktivierung = new Map((aktiv ?? []).map((a) => [a.content_type_id, a.position]))
  const ueber = new Map((abweichungen ?? []).map((o) => [o.field_id, o]))

  const baueFeld = (f: FeldZeile): Field | null => {
    const o = ueber.get(f.id)
    if (o?.hidden) return null
    return {
      id: f.id,
      key: f.key,
      type: f.type,
      label: o?.label ?? f.label,
      help: o?.help ?? f.help,
      // Pflicht lässt sich nur lockern, nie verschärfen -- der Constraint in
      // 0009 erzwingt das schon in der Datenbank, hier steht es noch einmal
      // sichtbar im Lesepfad.
      required: o?.required === false ? false : f.required,
      translatable: f.translatable,
      config: (f.config ?? {}) as Field['config'],
      position: f.position,
      children: [],
    }
  }

  const alleFelder = (felder ?? []) as FeldZeile[]

  return (typen ?? [])
    .filter((t) => aktivierung.has(t.id))
    .sort((a, b) => (aktivierung.get(a.id) ?? 0) - (aktivierung.get(b.id) ?? 0))
    .map((t) => {
      const eigene = alleFelder.filter((f) => f.content_type_id === t.id)
      const oben = eigene
        .filter((f) => !f.parent_field_id)
        .map(baueFeld)
        .filter((f): f is Field => f !== null)

      for (const feld of oben) {
        feld.children = eigene
          .filter((f) => f.parent_field_id === feld.id)
          .map(baueFeld)
          .filter((f): f is Field => f !== null)
      }

      return {
        id: t.id,
        key: t.key,
        name: t.name,
        namePlural: t.name_plural,
        kind: t.kind,
        sortable: t.sortable,
        hasSlug: t.has_slug,
        supportsSlots: t.supports_slots,
        description: t.description,
        fields: oben,
      } satisfies ContentType
    })
}

export type Eintrag = {
  id: string
  status: 'draft' | 'published' | 'archived'
  position: number
  slot: string | null
  priority: number
  publish_at: string | null
  valid_from: string | null
  valid_until: string | null
  field_values: FieldValues
  published_version_id: string | null
  updated_at: string
  translations: Record<string, { field_values: FieldValues; slug: string | null }>
}

export async function ladeEintraege(tenantId: string, contentTypeId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('entries')
    .select('id, status, position, slot, priority, publish_at, valid_from, valid_until, published_version_id, updated_at, field_values, entry_translations(locale, field_values, slug)')
    .eq('tenant_id', tenantId)
    .eq('content_type_id', contentTypeId)
    .order('position')
    .order('created_at')

  if (error) throw new Error(`Einträge konnten nicht geladen werden: ${error.message}`)
  return (data ?? []).map(formeEintrag)
}

export async function ladeEintrag(entryId: string): Promise<Eintrag | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('entries')
    .select('id, status, position, slot, priority, publish_at, valid_from, valid_until, published_version_id, updated_at, field_values, entry_translations(locale, field_values, slug)')
    .eq('id', entryId)
    .maybeSingle()

  if (error) throw new Error(`Eintrag konnte nicht geladen werden: ${error.message}`)
  return data ? formeEintrag(data) : null
}

type RohEintrag = Omit<Eintrag, 'translations'> & {
  entry_translations: { locale: string; field_values: FieldValues; slug: string | null }[]
}

function formeEintrag(roh: unknown): Eintrag {
  const r = roh as RohEintrag
  const translations: Eintrag['translations'] = {}
  for (const t of r.entry_translations ?? []) {
    translations[t.locale] = { field_values: t.field_values ?? {}, slug: t.slug }
  }
  return { ...r, field_values: r.field_values ?? {}, translations }
}

/**
 * Anzeigezustand eines Eintrags.
 *
 * "Geplant" ist bewusst kein gespeicherter Status, sondern wird hier abgeleitet
 * (siehe Kommentar an entry_status in Migration 0009). Ein gespeicherter Status
 * müsste von einem Job umgeschaltet werden -- verpasst der einen Lauf, steht die
 * Datenbank falsch da.
 */
export type Anzeigezustand =
  | 'entwurf' | 'geplant' | 'live' | 'abgelaufen' | 'noch_nicht_gueltig' | 'archiviert'

export function anzeigezustand(e: Eintrag, jetzt = new Date()): Anzeigezustand {
  if (e.status === 'archived') return 'archiviert'
  if (e.status === 'draft' || !e.published_version_id) return 'entwurf'
  if (e.publish_at && new Date(e.publish_at) > jetzt) return 'geplant'
  if (e.valid_from && new Date(e.valid_from) > jetzt) return 'noch_nicht_gueltig'
  if (e.valid_until && new Date(e.valid_until) <= jetzt) return 'abgelaufen'
  return 'live'
}

export const ZUSTAND_TEXT: Record<Anzeigezustand, string> = {
  entwurf: 'Entwurf',
  geplant: 'Geplant',
  live: 'Auf der Website',
  abgelaufen: 'Abgelaufen',
  noch_nicht_gueltig: 'Noch nicht gültig',
  archiviert: 'Archiviert',
}
