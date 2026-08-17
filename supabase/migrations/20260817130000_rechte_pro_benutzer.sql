-- =============================================================================
-- Vinamo CMS · 0017 Rechte pro Benutzer eingrenzen
--
-- Bisher durfte jeder Mandanten-Benutzer alles im eigenen Mandanten -- Inhalte
-- pflegen UND Zugänge anlegen. Das ist für die Wirtin richtig, aber nicht für
-- die Aushilfe, die nur das Tagesmenü tippt.
--
-- WARUM KEINE NEUEN ROLLEN
-- ------------------------
-- Der naheliegende Weg wäre gewesen, "editor" wieder einzuführen. Rollen sind
-- aber grobkörnig: Sobald ein Kunde jemanden will, der Team UND News pflegt,
-- aber keine Preise anfasst, braucht es die nächste Rolle. Nach drei Kunden hat
-- man fünf Rollen, die niemand mehr auseinanderhält.
--
-- Stattdessen zwei Angaben an der Mitgliedschaft:
--
--   can_manage_users        darf Zugänge anlegen, entfernen und Passwörter
--                           zurücksetzen
--   allowed_content_types   welche Inhaltstypen er bearbeiten darf
--                           NULL heisst: alle, die für den Mandanten
--                           freigeschaltet sind
--
-- Damit bleibt "Unterschiede sind Daten, niemals Code" auch für Berechtigungen
-- wahr, und ein neuer Zuschnitt ist ein Haken in der Oberfläche statt einer
-- Migration.
-- =============================================================================

alter table public.tenant_members
  add column can_manage_users      boolean not null default false,
  add column allowed_content_types uuid[];

comment on column public.tenant_members.can_manage_users is
  'Darf Zugänge dieses Mandanten anlegen, entfernen und Passwörter zurücksetzen.';
comment on column public.tenant_members.allowed_content_types is
  'Welche Inhaltstypen dieser Benutzer bearbeiten darf. NULL heisst alle für den
   Mandanten freigeschalteten -- der Normalfall. Eine leere Liste heisst keine.';

-- Bestehende Benutzer behalten, was sie hatten. Ein Rechtemodell einzuführen
-- darf niemandem still etwas wegnehmen.
update public.tenant_members set can_manage_users = true;


-- -----------------------------------------------------------------------------
-- can_manage_tenant fragt jetzt nach dem Recht, nicht nach der Mitgliedschaft
-- -----------------------------------------------------------------------------
create or replace function public.can_manage_tenant(p_tenant_id uuid)
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
      and m.can_manage_users
  ) or public.is_platform_admin();
$$;

revoke execute on function public.can_manage_tenant(uuid) from public, anon;
grant execute on function public.can_manage_tenant(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Darf dieser Benutzer diesen Inhaltstyp bearbeiten?
-- -----------------------------------------------------------------------------
create or replace function public.can_edit_content_type(p_tenant_id uuid, p_content_type_id uuid)
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
      and (m.allowed_content_types is null
           or p_content_type_id = any (m.allowed_content_types))
  ) or public.is_platform_admin();
$$;

revoke execute on function public.can_edit_content_type(uuid, uuid) from public, anon;
grant execute on function public.can_edit_content_type(uuid, uuid) to authenticated;

-- Für entry_translations: der Inhaltstyp hängt am Eintrag, nicht an der
-- Übersetzung. Eine eigene Funktion spart den Join in jeder Richtlinie.
create or replace function public.can_edit_entry(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entries e
    where e.id = p_entry_id
      and public.can_edit_content_type(e.tenant_id, e.content_type_id)
  );
$$;

revoke execute on function public.can_edit_entry(uuid) from public, anon;
grant execute on function public.can_edit_entry(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Richtlinien nachziehen
--
-- Die Einschränkung steht in der Datenbank, nicht nur in der Oberfläche. Wer die
-- Oberfläche umgeht, kommt trotzdem nicht an einen Inhaltstyp, für den er nicht
-- freigeschaltet ist.
-- -----------------------------------------------------------------------------
drop policy if exists entries_select on public.entries;
drop policy if exists entries_insert on public.entries;
drop policy if exists entries_update on public.entries;
drop policy if exists entries_delete on public.entries;

create policy entries_select on public.entries
  for select to authenticated
  using (public.can_edit_content_type(tenant_id, content_type_id));

create policy entries_insert on public.entries
  for insert to authenticated
  with check (public.can_edit_content_type(tenant_id, content_type_id));

create policy entries_update on public.entries
  for update to authenticated
  using (public.can_edit_content_type(tenant_id, content_type_id))
  with check (public.can_edit_content_type(tenant_id, content_type_id));

create policy entries_delete on public.entries
  for delete to authenticated
  using (public.can_edit_content_type(tenant_id, content_type_id));

drop policy if exists entry_translations_select on public.entry_translations;
drop policy if exists entry_translations_insert on public.entry_translations;
drop policy if exists entry_translations_update on public.entry_translations;
drop policy if exists entry_translations_delete on public.entry_translations;

create policy entry_translations_select on public.entry_translations
  for select to authenticated using (public.can_edit_entry(entry_id));
create policy entry_translations_insert on public.entry_translations
  for insert to authenticated with check (public.can_edit_entry(entry_id));
create policy entry_translations_update on public.entry_translations
  for update to authenticated
  using (public.can_edit_entry(entry_id)) with check (public.can_edit_entry(entry_id));
create policy entry_translations_delete on public.entry_translations
  for delete to authenticated using (public.can_edit_entry(entry_id));


-- publish_entry prüfte bisher nur die Mitgliedschaft. Ohne diese Anpassung
-- könnte ein eingeschränkter Benutzer zwar nichts bearbeiten, aber alles
-- veröffentlichen.
create or replace function public.publish_entry(p_entry_id uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_entry public.entries; v_version_no int; v_version_id uuid; v_snapshot jsonb; v_trans jsonb;
begin
  select * into v_entry from public.entries where id = p_entry_id;
  if not found then raise exception 'Eintrag % existiert nicht', p_entry_id using errcode = 'P0002'; end if;
  if not public.can_edit_content_type(v_entry.tenant_id, v_entry.content_type_id) then
    raise exception 'Kein Zugriff auf diesen Eintrag' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(t.locale,
           jsonb_build_object('field_values', t.field_values, 'slug', t.slug)), '{}'::jsonb)
  into v_trans from public.entry_translations t where t.entry_id = p_entry_id;

  v_snapshot := jsonb_build_object(
    'entry_id', v_entry.id, 'field_values', v_entry.field_values, 'translations', v_trans,
    'position', v_entry.position, 'slot', v_entry.slot, 'priority', v_entry.priority,
    'publish_at', v_entry.publish_at, 'valid_from', v_entry.valid_from, 'valid_until', v_entry.valid_until);

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.entry_versions where entry_id = p_entry_id;

  insert into public.entry_versions (entry_id, tenant_id, version_no, snapshot, note, published_by)
  values (p_entry_id, v_entry.tenant_id, v_version_no, v_snapshot, p_note, (select auth.uid()))
  returning id into v_version_id;

  update public.entries
  set published_version_id = v_version_id,
      status = case when status = 'archived' then status else 'published' end,
      updated_by = (select auth.uid())
  where id = p_entry_id;

  update public.entry_slugs set is_current = false where entry_id = p_entry_id and is_current;

  insert into public.entry_slugs (tenant_id, content_type_id, entry_id, locale, slug, is_current)
  select v_entry.tenant_id, v_entry.content_type_id, p_entry_id, t.locale, t.slug, true
  from public.entry_translations t
  where t.entry_id = p_entry_id and t.slug is not null
  on conflict do nothing;

  perform public.log_audit(v_entry.tenant_id, 'entry.published', 'entry', p_entry_id::text,
    jsonb_build_object('version_no', v_version_no));

  return v_version_id;
end; $$;

grant execute on function public.publish_entry(uuid, text) to authenticated;
