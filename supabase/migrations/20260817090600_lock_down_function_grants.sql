-- =============================================================================
-- Vinamo CMS · 0007 Ausführungsrechte auf Funktionen zurückschneiden
--
-- Postgres vergibt EXECUTE auf neue Funktionen standardmässig an PUBLIC. In
-- Supabase heisst das: jede Funktion in public ist als /rest/v1/rpc/<name>
-- erreichbar -- auch für nicht angemeldete Aufrufer. Bei SECURITY-DEFINER-
-- Funktionen ist das die gefährliche Kombination, weil sie mit den Rechten des
-- Eigentümers laufen und RLS umgehen.
--
-- Gemeldet vom Supabase-Linter (0028 / 0029) nach dem ersten Deploy.
--
-- Grundsatz hier: PUBLIC bekommt auf nichts EXECUTE. Danach wird gezielt
-- zurückgegeben, was eine Rolle wirklich braucht.
-- =============================================================================

-- --- Alles entziehen ---------------------------------------------------------
revoke execute on function public.is_platform_admin()                from public, anon, authenticated;
revoke execute on function public.is_tenant_member(uuid)             from public, anon, authenticated;
revoke execute on function public.is_tenant_owner(uuid)              from public, anon, authenticated;
revoke execute on function public.feature_enabled(uuid, text)        from public, anon, authenticated;
revoke execute on function public.log_audit(uuid, text, text, text, jsonb)
                                                                     from public, anon, authenticated;
revoke execute on function public.tables_missing_tenant_isolation()  from public, anon, authenticated;
revoke execute on function public.assert_tenant_has_owner()          from public, anon, authenticated;
revoke execute on function public.handle_new_user()                  from public, anon, authenticated;
revoke execute on function public.set_updated_at()                   from public, anon, authenticated;


-- --- Gezielt zurückgeben -----------------------------------------------------

-- Die RLS-Richtlinien werden mit den Rechten der abfragenden Rolle ausgewertet.
-- Ohne EXECUTE für authenticated schlüge jede Abfrage auf jede Tabelle fehl.
-- Diese drei geben ausschliesslich Auskunft über den Aufrufer selbst.
grant execute on function public.is_platform_admin()    to authenticated;
grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.is_tenant_owner(uuid)  to authenticated;

-- Schreibt das Änderungsprotokoll und prüft die Mitgliedschaft selbst.
grant execute on function public.log_audit(uuid, text, text, text, jsonb) to authenticated;

-- Funktionsschalter: Aufruf erlaubt, aber die Funktion beantwortet ab jetzt nur
-- noch Fragen zu Mandanten, denen der Aufrufer angehört. Vorher konnte jeder
-- Angemeldete mit einer geratenen Mandanten-UUID abfragen, welche Funktionen
-- dort eingeschaltet sind.
create or replace function public.feature_enabled(p_tenant_id uuid, p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result boolean;
begin
  if p_tenant_id is not null and not public.is_tenant_member(p_tenant_id) then
    return null;
  end if;

  select case
    when f.kill_switch then false
    else coalesce(tf.enabled, f.enabled_globally)
  end
  into v_result
  from public.feature_flags f
  left join public.tenant_feature_flags tf
    on tf.flag_key = f.key and tf.tenant_id = p_tenant_id
  where f.key = p_key;

  return v_result;
end;
$$;

grant execute on function public.feature_enabled(uuid, text) to authenticated;

-- Trigger-Funktionen werden vom Trigger aufgerufen, nie über die API. Sie
-- bekommen bewusst gar nichts zurück.
--
-- tables_missing_tenant_isolation() ebenfalls nicht: Sie legt die Schemastruktur
-- offen und wird ausschliesslich vom Isolationstest mit dem Service-Schlüssel
-- aufgerufen. service_role hat ohnehin BYPASSRLS und braucht keinen Grant.
