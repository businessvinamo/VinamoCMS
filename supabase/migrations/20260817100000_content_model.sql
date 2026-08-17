-- =============================================================================
-- Vinamo CMS · 0009 Inhaltsmodell
--
-- Inhaltstypen werden nicht programmiert, sondern hier definiert und pro Mandant
-- aktiviert. Ein neuer Typ ist ein INSERT, kein Deploy.
-- =============================================================================

create type public.content_kind  as enum ('single', 'collection');
create type public.entry_status  as enum ('draft', 'published', 'archived');

comment on type public.entry_status is
  'Bewusst ohne "scheduled". Terminierung ist kein gespeicherter Zustand, sondern
   wird beim Lesen ausgewertet (siehe entry_is_live). Ein gespeicherter Status
   müsste von einem Job umgeschaltet werden -- verpasst der Job einen Lauf, steht
   die Datenbank falsch da. Die Oberfläche zeigt "geplant" als abgeleitete
   Anzeige: published und publish_at liegt in der Zukunft.';


-- -----------------------------------------------------------------------------
-- Inhaltstypen und Felder · global definiert, von vinamo_admin gepflegt
-- -----------------------------------------------------------------------------
create table public.content_types (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  name_plural text not null,
  kind        public.content_kind not null default 'collection',
  sortable    boolean not null default false,
  has_slug    boolean not null default false,
  supports_slots boolean not null default false,
  description text not null default '',
  created_at  timestamptz not null default now(),

  constraint content_types_key_format check (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  -- Eine Einzelseite hat genau einen Eintrag; Sortierung ergäbe dort keinen Sinn.
  constraint content_types_single_not_sortable check (not (kind = 'single' and sortable))
);

comment on column public.content_types.supports_slots is
  'Erlaubt Plätze: mehrere Einträge desselben Typs konkurrieren um dieselbe Stelle
   (Saisonkarte schlägt Regelkarte). Aufgelöst über Priorität, siehe resolve_entries.';

create type public.field_type as enum (
  'text', 'textarea', 'richtext', 'number', 'price', 'date', 'datetime',
  'boolean', 'select', 'multiselect', 'media', 'repeater', 'reference'
);

create table public.fields (
  id               uuid primary key default gen_random_uuid(),
  content_type_id  uuid not null references public.content_types(id) on delete cascade,
  parent_field_id  uuid references public.fields(id) on delete cascade,
  key              text not null,
  type             public.field_type not null,
  label            text not null,
  help             text not null default '',
  required         boolean not null default false,
  translatable     boolean not null default false,
  config           jsonb not null default '{}'::jsonb,
  position         int not null default 0,
  created_at       timestamptz not null default now(),

  constraint fields_key_format check (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  -- Nur eine Ebene Verschachtelung. Ein Repeater im Repeater ist im Admin auf
  -- dem Handy nicht mehr bedienbar und im Datenmodell nicht mehr erklärbar.
  constraint fields_no_nested_repeater check (not (type = 'repeater' and parent_field_id is not null)),
  -- Preis, Datum, Bildreferenz und Zahl sind nie übersetzbar. Sonst pflegt der
  -- Kunde denselben Preis viermal und sie laufen auseinander.
  constraint fields_translatable_types check (
    not translatable or type in ('text', 'textarea', 'richtext', 'select', 'multiselect')
  ),
  -- Ein Repeater selbst trägt keine Übersetzung; seine Unterfelder tun das.
  constraint fields_repeater_not_translatable check (not (type = 'repeater' and translatable))
);

create unique index fields_unique_key
  on public.fields (content_type_id, coalesce(parent_field_id, '00000000-0000-0000-0000-000000000000'::uuid), key);
create index fields_content_type_idx on public.fields (content_type_id, position);
create index fields_parent_idx on public.fields (parent_field_id) where parent_field_id is not null;

comment on column public.fields.translatable is
  'Übersetzt wird auf Feldebene. Übersetzbare Werte liegen in entry_translations,
   alle anderen am Eintrag -- sonst pflegt der Kunde denselben Preis viermal.';


-- -----------------------------------------------------------------------------
-- Aktivierung pro Mandant
-- -----------------------------------------------------------------------------
create table public.tenant_content_types (
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  content_type_id  uuid not null references public.content_types(id) on delete cascade,
  position         int not null default 0,
  created_at       timestamptz not null default now(),
  primary key (tenant_id, content_type_id)
);

-- Abweichungen pro Mandant: ausschliesslich subtraktiv und kosmetisch.
-- Feld ausblenden, Beschriftung ändern, Pflicht lockern. Neue Felder gibt es nur
-- global -- sie sind additiv und stören niemanden, der sie nicht nutzt. Damit
-- bekommen nicht vier Kunden vier Schemata.
create table public.tenant_field_overrides (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  field_id   uuid not null references public.fields(id) on delete cascade,
  hidden     boolean not null default false,
  label      text,
  help       text,
  required   boolean,
  primary key (tenant_id, field_id),

  -- Pflicht lässt sich nur lockern, nie verschärfen. Ein Mandant, der ein global
  -- optionales Feld zur Pflicht macht, wäre ein Sonderfall im Validierungspfad.
  constraint tenant_field_overrides_only_relax check (required is null or required = false)
);


-- -----------------------------------------------------------------------------
-- Branchen-Baukasten
-- -----------------------------------------------------------------------------
create table public.blueprints (
  key         text primary key,
  name        text not null,
  description text not null default '',
  created_at  timestamptz not null default now(),
  constraint blueprints_key_format check (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$')
);

create table public.blueprint_content_types (
  blueprint_key    text not null references public.blueprints(key) on delete cascade,
  content_type_id  uuid not null references public.content_types(id) on delete cascade,
  position         int not null default 0,
  primary key (blueprint_key, content_type_id)
);


-- -----------------------------------------------------------------------------
-- Einträge · immer der ENTWURF
--
-- entries und entry_translations halten stets den Arbeitsstand des Kunden. Der
-- veröffentlichte Stand ist ein unveränderlicher Schnappschuss in entry_versions,
-- auf den published_version_id zeigt.
--
-- Das löst drei Dinge auf einmal:
--   * automatisches Zwischenspeichern kann nichts live schalten
--   * Versionshistorie und Rollback fallen ohne Zusatzaufwand an
--   * die öffentliche Lese-API liest EINE Zeile pro Eintrag statt über drei
--     Tabellen zu verbinden
-- -----------------------------------------------------------------------------
create table public.entries (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  content_type_id      uuid not null references public.content_types(id) on delete restrict,

  status               public.entry_status not null default 'draft',
  position             int not null default 0,

  -- Terminierung. Alle Zeitpunkte absolut; die Eingabe erfolgt in der Zeitzone
  -- des Mandanten (Europe/Zurich), gespeichert wird timestamptz -- sonst bricht
  -- die Zeitumstellung im März und Oktober.
  publish_at           timestamptz,
  valid_from           timestamptz,
  valid_until          timestamptz,

  -- Plätze: mehrere Einträge konkurrieren um dieselbe Stelle. Innerhalb eines
  -- Platzes gewinnt der gültige Eintrag mit der höchsten Priorität. Ein Eintrag
  -- ohne Gültigkeitszeitraum ist der Standard und greift, wenn sonst nichts gilt.
  slot                 text,
  priority             int not null default 0,

  -- Nicht übersetzbare Werte: Preis, Datum, Zahl, Medienbezug, Wiederholgruppen-
  -- Struktur inklusive Zeilen-IDs.
  field_values         jsonb not null default '{}'::jsonb,

  published_version_id uuid,

  created_at           timestamptz not null default now(),
  created_by           uuid references auth.users(id) on delete set null,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users(id) on delete set null,

  constraint entries_field_values_is_object check (jsonb_typeof(field_values) = 'object'),
  constraint entries_valid_range check (valid_until is null or valid_from is null or valid_until > valid_from),
  constraint entries_slot_format check (slot is null or slot ~ '^[a-z0-9]+(_[a-z0-9]+)*$')
);

create index entries_tenant_type_idx on public.entries (tenant_id, content_type_id, position);
create index entries_live_idx on public.entries (tenant_id, content_type_id, status)
  where status = 'published';
create index entries_slot_idx on public.entries (tenant_id, content_type_id, slot, priority desc)
  where slot is not null;

comment on column public.entries.field_values is
  'Nur nicht übersetzbare Felder. Wiederholgruppen liegen hier als Array von
   Zeilen, jede mit einem stabilen "_id". Übersetzungen verbinden sich über diese
   ID -- niemals über die Position im Array, sonst sitzen nach dem Einfügen einer
   Zeile alle französischen Bezeichnungen an den falschen Preisen.';


create table public.entry_translations (
  entry_id      uuid not null references public.entries(id) on delete cascade,
  locale        text not null,
  field_values  jsonb not null default '{}'::jsonb,
  slug          text,
  updated_at    timestamptz not null default now(),
  primary key (entry_id, locale),

  constraint entry_translations_locale check (locale in ('de', 'fr', 'it', 'en')),
  constraint entry_translations_is_object check (jsonb_typeof(field_values) = 'object'),
  constraint entry_translations_slug_format check (
    slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  )
);

comment on column public.entry_translations.field_values is
  'Nur übersetzbare Felder. Einfache Felder: {feldschluessel: wert}.
   Unterfelder einer Wiederholgruppe: {feldschluessel: {zeilen_id: {unterfeld: wert}}}.';


-- -----------------------------------------------------------------------------
-- Versionen · der veröffentlichte Stand
-- -----------------------------------------------------------------------------
create table public.entry_versions (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references public.entries(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  version_no    int not null,
  snapshot      jsonb not null,
  note          text,
  published_at  timestamptz not null default now(),
  published_by  uuid references auth.users(id) on delete set null,

  unique (entry_id, version_no)
);

create index entry_versions_entry_idx on public.entry_versions (entry_id, version_no desc);
create index entry_versions_tenant_idx on public.entry_versions (tenant_id, published_at desc);

comment on column public.entry_versions.snapshot is
  'Vollständiger Stand zum Zeitpunkt der Veröffentlichung: field_values, alle
   Übersetzungen, Slug je Sprache, Terminierung, Platz und Priorität. Die
   öffentliche Lese-API liest ausschliesslich hieraus.';

alter table public.entries
  add constraint entries_published_version_fk
  foreign key (published_version_id) references public.entry_versions(id) on delete set null;


-- -----------------------------------------------------------------------------
-- Slug-Historie · damit eine Umbenennung keinen 404 hinterlässt
-- -----------------------------------------------------------------------------
create table public.entry_slugs (
  id               bigint generated always as identity primary key,
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  content_type_id  uuid not null references public.content_types(id) on delete cascade,
  entry_id         uuid not null references public.entries(id) on delete cascade,
  locale           text not null,
  slug             text not null,
  is_current       boolean not null default true,
  created_at       timestamptz not null default now()
);

-- Ein Slug gehört pro Mandant, Typ und Sprache zu genau einem Eintrag.
create unique index entry_slugs_unique_current
  on public.entry_slugs (tenant_id, content_type_id, locale, slug)
  where is_current;
create index entry_slugs_lookup_idx on public.entry_slugs (tenant_id, content_type_id, locale, slug);


-- -----------------------------------------------------------------------------
-- Verweise · referentielle Integrität für IDs, die in JSONB stecken
--
-- Postgres kann auf einen Wert innerhalb von field_values keinen Fremdschlüssel
-- legen. Ohne diese Tabelle entstehen beim Löschen eines Bildes tote Verweise,
-- die erst auf der Kundenwebsite als fehlendes Bild auffallen.
-- -----------------------------------------------------------------------------
create type public.reference_kind as enum ('entry', 'media');

create table public.entry_references (
  entry_id     uuid not null references public.entries(id) on delete cascade,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  field_key    text not null,
  target_kind  public.reference_kind not null,
  target_id    uuid not null,
  primary key (entry_id, field_key, target_kind, target_id)
);

create index entry_references_target_idx on public.entry_references (target_kind, target_id);


-- -----------------------------------------------------------------------------
-- Trigger
-- -----------------------------------------------------------------------------
create trigger entries_set_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();

create trigger entry_translations_set_updated_at
  before update on public.entry_translations
  for each row execute function public.set_updated_at();

-- Ein Eintrag darf nur zu einem Inhaltstyp gehören, der für seinen Mandanten
-- freigeschaltet ist. Sonst entstehen Inhalte, die im Admin gar nicht auftauchen.
create or replace function public.assert_content_type_enabled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tenant_content_types tct
    where tct.tenant_id = new.tenant_id
      and tct.content_type_id = new.content_type_id
  ) then
    raise exception 'Inhaltstyp % ist für Mandant % nicht freigeschaltet',
      new.content_type_id, new.tenant_id using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger entries_content_type_enabled
  before insert or update of content_type_id, tenant_id on public.entries
  for each row execute function public.assert_content_type_enabled();

-- Eine Einzelseite hat genau einen Eintrag pro Mandant.
--
-- Nicht als partieller Index lösbar: dessen Prädikat dürfte keine Unterabfrage
-- auf content_types enthalten. Deshalb ein Trigger.
create or replace function public.assert_single_entry_for_single_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.content_types ct
    where ct.id = new.content_type_id and ct.kind = 'single'
  ) and exists (
    select 1 from public.entries e
    where e.tenant_id = new.tenant_id
      and e.content_type_id = new.content_type_id
      and e.id <> new.id
  ) then
    raise exception 'Dieser Inhaltstyp ist eine Einzelseite und hat bereits einen Eintrag'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

create trigger entries_single_type_guard
  before insert or update of content_type_id, tenant_id on public.entries
  for each row execute function public.assert_single_entry_for_single_type();
