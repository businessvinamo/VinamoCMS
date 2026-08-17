-- =============================================================================
-- Vinamo CMS · 0002 Row Level Security
--
-- Weil alle Kunden dieselbe Instanz nutzen, ist RLS die einzige Grenze zwischen
-- ihnen. Regeln für diese Datei:
--
--   1. Jede Tabelle mit tenant_id bekommt RLS und mindestens eine Richtlinie.
--      Durchgesetzt vom Test in tests/isolation.test.ts, der die Tabellen zur
--      Laufzeit aus dem Systemkatalog liest -- eine neue Tabelle ohne Richtlinie
--      macht die Testsuite rot, ohne dass jemand daran denken muss.
--   2. anon bekommt auf keiner Tabelle Rechte. Die öffentliche Lese-API kommt in
--      Phase 3 als Serverschicht, nicht als direkter PostgREST-Zugriff.
--   3. Richtlinien lesen nur über die SECURITY-DEFINER-Hilfsfunktionen aus 0001,
--      nie direkt aus tenant_members -- sonst Endlosrekursion.
-- =============================================================================

alter table public.tenants              enable row level security;
alter table public.tenant_members       enable row level security;
alter table public.platform_admins      enable row level security;
alter table public.invitations          enable row level security;
alter table public.feature_flags        enable row level security;
alter table public.tenant_feature_flags enable row level security;
alter table public.audit_log            enable row level security;

-- Kein Zugriff ohne Anmeldung, auf keiner Tabelle.
revoke all on public.tenants, public.tenant_members, public.platform_admins,
              public.invitations, public.feature_flags, public.tenant_feature_flags,
              public.audit_log
  from anon;


-- -----------------------------------------------------------------------------
-- tenants · Kunden dürfen ihren Mandanten sehen, aber nicht anlegen oder ändern.
-- -----------------------------------------------------------------------------
create policy tenants_select on public.tenants
  for select to authenticated
  using (public.is_tenant_member(id));

create policy tenants_write on public.tenants
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());


-- -----------------------------------------------------------------------------
-- tenant_members · owner darf einladen und entfernen, editor darf nur sehen.
-- -----------------------------------------------------------------------------
create policy tenant_members_select on public.tenant_members
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

create policy tenant_members_insert on public.tenant_members
  for insert to authenticated
  with check (public.is_tenant_owner(tenant_id));

create policy tenant_members_update on public.tenant_members
  for update to authenticated
  using (public.is_tenant_owner(tenant_id))
  with check (public.is_tenant_owner(tenant_id));

create policy tenant_members_delete on public.tenant_members
  for delete to authenticated
  using (public.is_tenant_owner(tenant_id));


-- -----------------------------------------------------------------------------
-- platform_admins · sichtbar nur für Plattformadministratoren, beschreibbar für
-- niemanden über die API. Wer hier hineinkommt, kommt über eine Einladung oder
-- eine Migration.
-- -----------------------------------------------------------------------------
create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using (public.is_platform_admin());


-- -----------------------------------------------------------------------------
-- invitations · Ein owner darf in seinen Mandanten einladen. Er darf dabei unter
-- keinen Umständen Plattformrechte vergeben: die WITH-CHECK-Klausel verlangt
-- dafür ausdrücklich is_platform_admin().
-- -----------------------------------------------------------------------------
create policy invitations_select on public.invitations
  for select to authenticated
  using (
    (tenant_id is not null and public.is_tenant_member(tenant_id))
    or public.is_platform_admin()
  );

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    case
      when grants_platform_admin then public.is_platform_admin()
      else public.is_tenant_owner(tenant_id)
    end
  );

create policy invitations_delete on public.invitations
  for delete to authenticated
  using (
    accepted_at is null
    and (
      (tenant_id is not null and public.is_tenant_owner(tenant_id))
      or public.is_platform_admin()
    )
  );


-- -----------------------------------------------------------------------------
-- Funktionsschalter · lesbar für alle Angemeldeten (der Mandantenbezug steckt in
-- tenant_feature_flags), schreibbar nur für die Plattform.
-- -----------------------------------------------------------------------------
create policy feature_flags_select on public.feature_flags
  for select to authenticated
  using (true);

create policy feature_flags_write on public.feature_flags
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy tenant_feature_flags_select on public.tenant_feature_flags
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

create policy tenant_feature_flags_write on public.tenant_feature_flags
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());


-- -----------------------------------------------------------------------------
-- audit_log · lesbar für den Mandanten, schreibbar ausschliesslich über
-- public.log_audit(). Absichtlich keine INSERT-Richtlinie: ein Protokoll, das der
-- Protokollierte selbst schreiben darf, ist keins.
-- -----------------------------------------------------------------------------
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    case
      when tenant_id is null then public.is_platform_admin()
      else public.is_tenant_member(tenant_id)
    end
  );


-- -----------------------------------------------------------------------------
-- Selbstprüfung
--
-- Liefert jede Tabelle in public, die eine tenant_id trägt und entweder RLS aus
-- hat oder keine einzige Richtlinie besitzt. Der Isolationstest erwartet null
-- Zeilen. Damit wird jede künftige Tabelle automatisch mitgeprüft, statt dass
-- jemand daran denken muss, einen Test nachzutragen.
-- -----------------------------------------------------------------------------
create or replace function public.tables_missing_tenant_isolation()
returns table (table_name text, rls_enabled boolean, policy_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.relname::text,
    c.relrowsecurity,
    (select count(*) from pg_catalog.pg_policy p where p.polrelid = c.oid)
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = c.oid
        and a.attname = 'tenant_id'
        and a.attnum > 0
        and not a.attisdropped
    )
    and (
      not c.relrowsecurity
      or (select count(*) from pg_catalog.pg_policy p where p.polrelid = c.oid) = 0
    );
$$;

grant execute on function public.tables_missing_tenant_isolation() to authenticated;
