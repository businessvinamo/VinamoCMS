-- =============================================================================
-- Vinamo CMS · 0001 Fundament
-- Mandanten, Mitgliedschaften, Rollen, Einladungen, Funktionsschalter, Protokoll.
--
-- Migrationsregel für dieses Projekt: strikt abwärtskompatibel.
-- Spalte hinzufügen -> deployen -> Code umstellen -> Altes entfernen. Nie in einem Schritt.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Rollen
--
-- owner  und editor sind Rollen INNERHALB eines Mandanten und stehen deshalb an
-- der Mitgliedschaft. vinamo_admin ist bewusst KEINE Mandantenrolle, sondern eine
-- Plattformrolle in einer eigenen Tabelle -- sonst bräuchte Kevin für jeden neuen
-- Kunden eine Mitgliedschaftszeile, und "mandantenübergreifend" wäre eine Lüge.
-- -----------------------------------------------------------------------------
create type public.tenant_role as enum ('owner', 'editor');


-- -----------------------------------------------------------------------------
-- Mandanten
-- -----------------------------------------------------------------------------
create table public.tenants (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  primary_domain  text unique,
  locales         text[] not null default array['de'],
  default_locale  text not null default 'de',
  timezone        text not null default 'Europe/Zurich',
  branding        jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint tenants_slug_format check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 63
  ),
  constraint tenants_slug_not_reserved check (
    slug not in ('admin', 'api', 'auth', 'login', 'logout', 'new', 'settings', 'vinamo')
  ),
  constraint tenants_name_not_blank check (length(btrim(name)) > 0),
  constraint tenants_locales_not_empty check (cardinality(locales) > 0),
  constraint tenants_locales_supported check (locales <@ array['de', 'fr', 'it', 'en']),
  constraint tenants_default_locale_is_active check (default_locale = any (locales))
);

comment on table public.tenants is
  'Ein Kunde = ein Mandant. Alles Kundenspezifische ist hier oder in tenant_feature_flags Daten, niemals Code.';
comment on column public.tenants.primary_domain is
  'Vorbereitung für den Umbau auf Domain-Routing (ab ca. 30 Mandanten). Heute ungenutzt, spart später eine Datenmigration.';
comment on column public.tenants.default_locale is
  'Fallback-Sprache. Fehlt eine Übersetzung, greift diese -- die Website darf nie leer bleiben.';


-- -----------------------------------------------------------------------------
-- Mitgliedschaften
-- -----------------------------------------------------------------------------
create table public.tenant_members (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.tenant_role not null default 'editor',
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- Ein Benutzer kann mehreren Mandanten angehören (Treuhänder, Agenturpartner).
-- Dieser Index trägt die "welche Mandanten hat dieser Nutzer"-Abfrage, die bei
-- jeder RLS-Prüfung läuft.
create index tenant_members_user_id_idx on public.tenant_members (user_id);

comment on table public.tenant_members is
  'Verknüpft Supabase-Auth-Benutzer mit Mandant und Rolle. Ein Benutzer kann mehreren Mandanten angehören.';


-- -----------------------------------------------------------------------------
-- Plattformadministratoren (vinamo_admin)
-- -----------------------------------------------------------------------------
create table public.platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  note        text,
  created_at  timestamptz not null default now()
);

comment on table public.platform_admins is
  'Mandantenübergreifender Zugriff. Wird ausschliesslich über Einladungen oder Migrationen befüllt, nie über die Oberfläche.';


-- -----------------------------------------------------------------------------
-- Hilfsfunktionen für Row Level Security
--
-- Alle SECURITY DEFINER, damit sie die Richtlinien der gelesenen Tabelle
-- umgehen. Ohne das erzeugt eine Richtlinie auf tenant_members, die zur Prüfung
-- selbst tenant_members abfragt, eine Endlosrekursion und macht die Tabelle für
-- alle unlesbar -- der klassische Fehler in mandantenfähigen Supabase-Projekten.
--
-- Bewusste Abweichung vom Umsetzungsplan: dort standen Mandantszugehörigkeit und
-- Rolle als Claims im JWT. Claims sind schneller, aber bis zum nächsten
-- Token-Refresh veraltet -- wer heute entlassen wird, hätte bis zu eine Stunde
-- weiter Zugriff. Diese Funktionen kosten einen Index-Lookup und entziehen
-- Rechte sofort. Bei unter zwanzig Mandanten ist das der richtige Tausch.
-- -----------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id
      and m.user_id = (select auth.uid())
  ) or public.is_platform_admin();
$$;

create or replace function public.is_tenant_owner(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  ) or public.is_platform_admin();
$$;

comment on function public.is_tenant_member(uuid) is
  'Wahr für Mitglieder des Mandanten und für Plattformadministratoren. Baustein jeder Lese-Richtlinie.';


-- -----------------------------------------------------------------------------
-- Einladungen
--
-- Der Einladungsweg löst zugleich das Henne-Ei-Problem beim ersten Login: Die
-- Berechtigung wird auf die E-Mail-Adresse ausgestellt, bevor der Auth-Benutzer
-- existiert, und beim ersten Anmelden automatisch eingelöst. Deshalb müssen
-- weder Passwörter noch künstliche auth.users-Zeilen geseedet werden.
-- -----------------------------------------------------------------------------
create table public.invitations (
  id                     uuid primary key default gen_random_uuid(),
  email                  text not null,
  tenant_id              uuid references public.tenants(id) on delete cascade,
  role                   public.tenant_role,
  grants_platform_admin  boolean not null default false,
  invited_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  expires_at             timestamptz not null default now() + interval '14 days',
  accepted_at            timestamptz,
  accepted_by            uuid references auth.users(id) on delete set null,

  constraint invitations_email_shape check (position('@' in email) > 1),
  constraint invitations_has_target check (
    (tenant_id is not null and role is not null) or grants_platform_admin
  )
);

-- Pro E-Mail und Ziel höchstens eine offene Einladung.
create unique index invitations_open_unique
  on public.invitations (lower(email), coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where accepted_at is null;

create index invitations_email_idx on public.invitations (lower(email)) where accepted_at is null;


-- -----------------------------------------------------------------------------
-- Funktionsschalter
--
-- Jede neue Funktion liegt hinter einem Schalter, der sich global und pro
-- Mandant sofort abschalten lässt. kill_switch schlägt alles -- damit ist eine
-- kaputte Funktion in einem einzigen UPDATE für alle Kunden aus, ohne Deploy.
-- -----------------------------------------------------------------------------
create table public.feature_flags (
  key               text primary key,
  description       text not null default '',
  enabled_globally  boolean not null default false,
  kill_switch       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint feature_flags_key_format check (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$')
);

create table public.tenant_feature_flags (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  flag_key    text not null references public.feature_flags(key) on delete cascade,
  enabled     boolean not null,
  created_at  timestamptz not null default now(),
  primary key (tenant_id, flag_key)
);

-- Auflösung an genau einer Stelle, damit Server und Datenbank nie
-- unterschiedlicher Meinung darüber sind, ob eine Funktion an ist.
create or replace function public.feature_enabled(p_tenant_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when f.kill_switch then false
    else coalesce(tf.enabled, f.enabled_globally)
  end
  from public.feature_flags f
  left join public.tenant_feature_flags tf
    on tf.flag_key = f.key and tf.tenant_id = p_tenant_id
  where f.key = p_key;
$$;

comment on function public.feature_enabled(uuid, text) is
  'Auflösungsreihenfolge: kill_switch schlägt alles, sonst Mandanten-Übersteuerung, sonst globaler Standard. Unbekannter Schlüssel ergibt NULL.';


-- -----------------------------------------------------------------------------
-- Änderungsprotokoll
--
-- actor_email wird denormalisiert mitgeschrieben: Wenn ein Mitarbeiter später
-- gelöscht wird, muss trotzdem nachvollziehbar bleiben, wer was veröffentlicht hat.
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id           bigint generated always as identity primary key,
  tenant_id    uuid references public.tenants(id) on delete cascade,
  actor_id     uuid references auth.users(id) on delete set null,
  actor_email  text,
  action       text not null,
  target_type  text,
  target_id    text,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index audit_log_tenant_created_idx on public.audit_log (tenant_id, created_at desc);

-- Geschrieben wird ausschliesslich hierüber. Es gibt bewusst keine
-- INSERT-Richtlinie auf audit_log, damit niemand Einträge fälschen oder
-- rückdatieren kann.
create or replace function public.log_audit(
  p_tenant_id   uuid,
  p_action      text,
  p_target_type text default null,
  p_target_id   text default null,
  p_meta        jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_tenant_id is not null and not public.is_tenant_member(p_tenant_id) then
    raise exception 'Kein Zugriff auf Mandant %', p_tenant_id using errcode = '42501';
  end if;

  insert into public.audit_log (tenant_id, actor_id, actor_email, action, target_type, target_id, meta)
  values (
    p_tenant_id,
    (select auth.uid()),
    (select u.email from auth.users u where u.id = (select auth.uid())),
    p_action,
    p_target_type,
    p_target_id,
    coalesce(p_meta, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- Trigger
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

create trigger feature_flags_set_updated_at
  before update on public.feature_flags
  for each row execute function public.set_updated_at();


-- Ein Mandant ohne owner ist ein Mandant, in den niemand mehr jemanden einladen
-- kann. Das lässt sich nur mit einem Trigger verhindern, nicht mit einem Constraint.
create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := old.tenant_id;
  v_remaining int;
begin
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' then
    return new;
  end if;

  select count(*) into v_remaining
  from public.tenant_members m
  where m.tenant_id = v_tenant_id
    and m.role = 'owner'
    and m.user_id <> old.user_id;

  if v_remaining = 0 then
    raise exception 'Der letzte Besitzer eines Mandanten kann nicht entfernt werden'
      using errcode = '23514';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger tenant_members_keep_one_owner
  before update or delete on public.tenant_members
  for each row execute function public.prevent_last_owner_removal();


-- Einladungen werden beim ersten Anmelden automatisch eingelöst.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv record;
begin
  for inv in
    select * from public.invitations
    where lower(email) = lower(new.email)
      and accepted_at is null
      and expires_at > now()
  loop
    if inv.grants_platform_admin then
      insert into public.platform_admins (user_id, note)
      values (new.id, 'Über Einladung ' || inv.id)
      on conflict (user_id) do nothing;
    end if;

    if inv.tenant_id is not null then
      insert into public.tenant_members (tenant_id, user_id, role, invited_by)
      values (inv.tenant_id, new.id, inv.role, inv.invited_by)
      on conflict (tenant_id, user_id) do nothing;
    end if;

    update public.invitations
    set accepted_at = now(), accepted_by = new.id
    where id = inv.id;
  end loop;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
