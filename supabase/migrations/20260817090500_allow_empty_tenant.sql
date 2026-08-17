-- =============================================================================
-- Vinamo CMS · 0006 Leerer Mandant ist ein gültiger Zustand
--
-- 0005 verlangte: ein Mandant hat immer einen Besitzer. Das ist zu streng und
-- widerspricht dem eigenen Onboarding-Ablauf -- ein frisch angelegter Mandant hat
-- naturgemäss noch gar keine Mitglieder, die Einladung folgt erst danach. Ebenso
-- muss sich beim Offboarding eines Kunden das letzte Mitglied entfernen lassen.
--
-- Die Regel, die wir wirklich meinen, ist eine andere:
--   Ein Mandant, der Mitglieder hat, muss mindestens einen Besitzer haben.
-- Sonst entsteht ein Mandant voller editor-Konten, in den niemand mehr jemanden
-- einladen kann -- der Zustand, den es zu verhindern gilt.
--
-- Migrationsdisziplin: 0005 wird nicht umgeschrieben. Migrationen sind
-- ausschliesslich additiv, auch wenn der Fehler zehn Minuten alt ist.
-- =============================================================================

create or replace function public.assert_tenant_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id    uuid := old.tenant_id;
  v_member_count int;
  v_owner_count  int;
begin
  -- Der Mandant ist in derselben Transaktion verschwunden: nichts zu schützen.
  if not exists (select 1 from public.tenants t where t.id = v_tenant_id) then
    return null;
  end if;

  select
    count(*),
    count(*) filter (where m.role = 'owner')
  into v_member_count, v_owner_count
  from public.tenant_members m
  where m.tenant_id = v_tenant_id;

  -- Gar keine Mitglieder mehr ist erlaubt: Mandant vor dem Onboarding oder nach
  -- dem Offboarding. Nur der Mischzustand ist verboten.
  if v_member_count > 0 and v_owner_count = 0 then
    raise exception
      'Mandant % hätte danach Mitglieder, aber keinen Besitzer. Erst einen neuen Besitzer bestimmen.',
      v_tenant_id
      using errcode = '23514';
  end if;

  return null;
end;
$$;

comment on function public.assert_tenant_has_owner() is
  'Zurückgestellt bis COMMIT. Erlaubt leere Mandanten, Besitzerwechsel und Cascade-Löschungen; verbietet nur Mitglieder ohne Besitzer.';
