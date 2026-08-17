-- =============================================================================
-- Vinamo CMS · 0015 Rollen vereinfachen: admin und client
--
-- Bisher: vinamo_admin (Plattform), owner und editor (pro Mandant).
-- Neu:    admin (Plattform), client (pro Mandant). editor entfällt.
--
-- Fachlich heisst das: Jeder Benutzer eines Mandanten darf alles, was in seinem
-- Mandanten möglich ist -- Inhalte pflegen UND weitere Zugänge anlegen. Braucht
-- ein Kunde eine zweite Person, bekommt sie einen eigenen Zugang, keine
-- abgestufte Rolle.
--
-- Zwei Dinge fallen dadurch weg:
--
--  * is_tenant_owner() wäre ab jetzt identisch mit is_tenant_member(). Statt eine
--    sinnlose Verdopplung stehen zu lassen, wird daraus can_manage_tenant() --
--    ein Name, der die Frage stellt statt die Rolle zu nennen. Käme später doch
--    eine reine Leserolle dazu, ändert sich nur diese eine Funktion, nicht
--    zwanzig Richtlinien.
--
--  * assert_tenant_has_owner() wird gegenstandslos. Die Regel schützte davor,
--    dass ein Mandant nur noch editor-Konten hat und niemand mehr einladen kann.
--    Diesen Zustand gibt es nicht mehr.
-- =============================================================================

-- --- Richtlinien lösen, die an is_tenant_owner hängen ------------------------
drop policy if exists tenant_members_insert on public.tenant_members;
drop policy if exists tenant_members_update on public.tenant_members;
drop policy if exists tenant_members_delete on public.tenant_members;
drop policy if exists invitations_select    on public.invitations;
drop policy if exists invitations_insert    on public.invitations;
drop policy if exists invitations_delete    on public.invitations;
drop policy if exists webhooks_select       on public.webhooks;

drop trigger  if exists tenant_members_require_owner on public.tenant_members;
drop function if exists public.assert_tenant_has_owner();
drop function if exists public.is_tenant_owner(uuid);


-- --- Enum austauschen --------------------------------------------------------
-- Postgres kann einzelne Enum-Werte nicht entfernen. Also neuer Typ, Spalten
-- umhängen, alten Typ weg.
create type public.tenant_role_neu as enum ('client');

alter table public.tenant_members
  alter column role drop default,
  alter column role type public.tenant_role_neu using 'client'::public.tenant_role_neu,
  alter column role set default 'client';

alter table public.invitations
  alter column role type public.tenant_role_neu using
    case when role is null then null else 'client'::public.tenant_role_neu end;

drop type public.tenant_role;
alter type public.tenant_role_neu rename to tenant_role;

comment on type public.tenant_role is
  'Rolle innerhalb eines Mandanten. Aktuell nur "client": alle Benutzer eines
   Mandanten sind gleichberechtigt. Der Typ bleibt bestehen, damit eine spätere
   abgestufte Rolle keine Schemaänderung an tenant_members braucht.';


-- --- Neue Berechtigungsfrage -------------------------------------------------
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
  ) or public.is_platform_admin();
$$;

comment on function public.can_manage_tenant(uuid) is
  'Darf der Aufrufer diesen Mandanten verwalten -- Zugänge anlegen, Webhooks sehen,
   Daten exportieren? Heute gleichbedeutend mit "ist Mitglied", weil es nur eine
   Mandantenrolle gibt. Der eigene Name existiert, damit eine spätere Leserolle
   nur hier eingebaut werden muss.';

revoke execute on function public.can_manage_tenant(uuid) from public, anon;
grant execute on function public.can_manage_tenant(uuid) to authenticated;


-- --- Richtlinien neu ---------------------------------------------------------
create policy tenant_members_insert on public.tenant_members
  for insert to authenticated
  with check (public.can_manage_tenant(tenant_id));

create policy tenant_members_update on public.tenant_members
  for update to authenticated
  using (public.can_manage_tenant(tenant_id))
  with check (public.can_manage_tenant(tenant_id));

create policy tenant_members_delete on public.tenant_members
  for delete to authenticated
  using (public.can_manage_tenant(tenant_id));

create policy invitations_select on public.invitations
  for select to authenticated
  using (
    (tenant_id is not null and public.can_manage_tenant(tenant_id))
    or public.is_platform_admin()
  );

-- Ein Mandanten-Benutzer darf niemals Plattformrechte vergeben. Das bleibt der
-- einzige Rechteunterschied, der im System noch existiert.
create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    case
      when grants_platform_admin then public.is_platform_admin()
      else public.can_manage_tenant(tenant_id)
    end
  );

create policy invitations_delete on public.invitations
  for delete to authenticated
  using (
    accepted_at is null
    and (
      (tenant_id is not null and public.can_manage_tenant(tenant_id))
      or public.is_platform_admin()
    )
  );

create policy webhooks_select on public.webhooks
  for select to authenticated
  using (public.can_manage_tenant(tenant_id));


-- --- Kommentare nachziehen ---------------------------------------------------
comment on table public.platform_admins is
  'Rolle "admin": mandantenübergreifender Zugriff. Wird ausschliesslich über
   Migrationen oder von einem bestehenden Admin befüllt, nie über die Oberfläche
   eines Mandanten.';
