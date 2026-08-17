-- =============================================================================
-- Vinamo CMS · 0005 Besitzerprüfung ans Transaktionsende verlegen
--
-- Befund aus dem Aufräumen nach dem ersten Isolationslauf: Der Trigger aus 0001
-- prüfte pro Zeile und sofort. Damit blockierte er auch Fälle, die legitim sind:
--
--   * Löschen eines Mandanten samt aller Mitgliedschaften (Cascade)
--   * Löschen eines Auth-Benutzers, der irgendwo alleiniger Besitzer ist
--     -- also genau den Weg, den eine DSGVO-Löschung nimmt
--
--   * Besitzerwechsel in einer Anweisung (alten entfernen, neuen eintragen)
--
-- Ein zurückgestellter Constraint-Trigger prüft erst beim COMMIT und stellt
-- dabei die eigentlich gemeinte Frage: Steht am Ende ein Mandant ohne Besitzer da?
-- Ist der Mandant selbst mit gelöscht worden, gibt es nichts zu schützen.
-- =============================================================================

drop trigger if exists tenant_members_keep_one_owner on public.tenant_members;
drop function if exists public.prevent_last_owner_removal();

create or replace function public.assert_tenant_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := old.tenant_id;
begin
  -- Der Mandant ist in derselben Transaktion verschwunden: nichts zu schützen.
  if not exists (select 1 from public.tenants t where t.id = v_tenant_id) then
    return null;
  end if;

  if not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = v_tenant_id and m.role = 'owner'
  ) then
    raise exception
      'Mandant % stünde danach ohne Besitzer da. Erst einen neuen Besitzer bestimmen, dann den alten entfernen.',
      v_tenant_id
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger tenant_members_require_owner
  after update or delete on public.tenant_members
  deferrable initially deferred
  for each row execute function public.assert_tenant_has_owner();

comment on function public.assert_tenant_has_owner() is
  'Zurückgestellt bis COMMIT: erlaubt Besitzerwechsel und Cascade-Löschungen, verhindert nur den Endzustand "Mandant ohne Besitzer".';
