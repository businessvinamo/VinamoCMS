-- =============================================================================
-- Vinamo CMS · 0008 Selbstprüfung nachschärfen
--
-- Zwei Nachbesserungen an tables_missing_tenant_isolation():
--
-- 1. Nach dem Entzug der PUBLIC-Rechte in 0007 hatte auch service_role kein
--    EXECUTE mehr. Der Isolationstest ruft die Funktion mit dem Service-
--    Schlüssel auf und lief damit auf einen Rechtefehler statt auf ein Ergebnis.
--
-- 2. Die Funktion fand nur Tabellen mit einer tenant_id-Spalte. Ausgerechnet
--    public.tenants hat keine -- der Mandant ist dort die Zeile selbst. Wäre RLS
--    auf tenants versehentlich aus, hätte die Selbstprüfung geschwiegen und
--    jeder Angemeldete sähe die Kundenliste von Vinamo. Genau der Fall, den
--    diese Prüfung verhindern soll.
-- =============================================================================

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
    and (
      -- Tabellen, die einem Mandanten zugeordnet sind ...
      exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid = c.oid
          and a.attname = 'tenant_id'
          and a.attnum > 0
          and not a.attisdropped
      )
      -- ... und die Mandantentabelle selbst.
      or c.relname = 'tenants'
    )
    and (
      not c.relrowsecurity
      or (select count(*) from pg_catalog.pg_policy p where p.polrelid = c.oid) = 0
    );
$$;

revoke execute on function public.tables_missing_tenant_isolation() from public, anon, authenticated;
grant execute on function public.tables_missing_tenant_isolation() to service_role;
