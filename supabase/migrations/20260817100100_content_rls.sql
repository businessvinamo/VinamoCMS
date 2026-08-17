-- =============================================================================
-- Vinamo CMS · 0010 Mandantentrennung für das Inhaltsmodell
--
-- Vorab eine Korrektur am Modell aus 0009: entry_translations hatte keine
-- tenant_id. Fachlich hängt die Übersetzung am Eintrag, technisch hätte
-- tables_missing_tenant_isolation() sie damit aber gar nicht geprüft -- die
-- Selbstprüfung sucht nach genau dieser Spalte. Eine Tabelle mit Kundeninhalten,
-- die durch das Sicherheitsnetz fällt, ist den denormalisierten Schlüssel wert.
-- Ein Trigger setzt ihn, niemand trägt ihn von Hand ein.
-- =============================================================================

alter table public.entry_translations
  add column tenant_id uuid references public.tenants(id) on delete cascade;

create or replace function public.set_translation_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select e.tenant_id into new.tenant_id
  from public.entries e where e.id = new.entry_id;
  return new;
end;
$$;

create trigger entry_translations_set_tenant
  before insert or update of entry_id on public.entry_translations
  for each row execute function public.set_translation_tenant();

-- Tabelle ist beim Ausrollen leer; der Trigger füllt ab jetzt.
update public.entry_translations t
set tenant_id = e.tenant_id
from public.entries e
where e.id = t.entry_id and t.tenant_id is null;

alter table public.entry_translations alter column tenant_id set not null;
create index entry_translations_tenant_idx on public.entry_translations (tenant_id);


-- -----------------------------------------------------------------------------
-- RLS einschalten
-- -----------------------------------------------------------------------------
alter table public.content_types           enable row level security;
alter table public.fields                  enable row level security;
alter table public.tenant_content_types    enable row level security;
alter table public.tenant_field_overrides  enable row level security;
alter table public.blueprints              enable row level security;
alter table public.blueprint_content_types enable row level security;
alter table public.entries                 enable row level security;
alter table public.entry_translations      enable row level security;
alter table public.entry_versions          enable row level security;
alter table public.entry_slugs             enable row level security;
alter table public.entry_references        enable row level security;

revoke all on public.content_types, public.fields, public.tenant_content_types,
              public.tenant_field_overrides, public.blueprints, public.blueprint_content_types,
              public.entries, public.entry_translations, public.entry_versions,
              public.entry_slugs, public.entry_references
  from anon;


-- -----------------------------------------------------------------------------
-- Typdefinitionen · für alle Angemeldeten lesbar, nur für vinamo_admin änderbar
--
-- Genau das ist die Regel aus der Spezifikation: Kunden dürfen keine
-- Inhaltstypen anlegen oder verändern. Sie steht hier in der Datenbank und nicht
-- nur in der Oberfläche.
-- -----------------------------------------------------------------------------
create policy content_types_select on public.content_types
  for select to authenticated using (true);
create policy content_types_write on public.content_types
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy fields_select on public.fields
  for select to authenticated using (true);
create policy fields_write on public.fields
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy blueprints_select on public.blueprints
  for select to authenticated using (true);
create policy blueprints_write on public.blueprints
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy blueprint_content_types_select on public.blueprint_content_types
  for select to authenticated using (true);
create policy blueprint_content_types_write on public.blueprint_content_types
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());


-- -----------------------------------------------------------------------------
-- Freischaltung und Abweichungen · sichtbar für den Mandanten, gesetzt von Vinamo
-- -----------------------------------------------------------------------------
create policy tenant_content_types_select on public.tenant_content_types
  for select to authenticated using (public.is_tenant_member(tenant_id));
create policy tenant_content_types_write on public.tenant_content_types
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy tenant_field_overrides_select on public.tenant_field_overrides
  for select to authenticated using (public.is_tenant_member(tenant_id));
create policy tenant_field_overrides_write on public.tenant_field_overrides
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());


-- -----------------------------------------------------------------------------
-- Inhalte · Redaktion und Besitzer dürfen beides, lesen und schreiben
-- -----------------------------------------------------------------------------
create policy entries_select on public.entries
  for select to authenticated using (public.is_tenant_member(tenant_id));
create policy entries_insert on public.entries
  for insert to authenticated with check (public.is_tenant_member(tenant_id));
create policy entries_update on public.entries
  for update to authenticated
  using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
create policy entries_delete on public.entries
  for delete to authenticated using (public.is_tenant_member(tenant_id));

create policy entry_translations_select on public.entry_translations
  for select to authenticated using (public.is_tenant_member(tenant_id));
create policy entry_translations_insert on public.entry_translations
  for insert to authenticated with check (public.is_tenant_member(tenant_id));
create policy entry_translations_update on public.entry_translations
  for update to authenticated
  using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
create policy entry_translations_delete on public.entry_translations
  for delete to authenticated using (public.is_tenant_member(tenant_id));

create policy entry_references_select on public.entry_references
  for select to authenticated using (public.is_tenant_member(tenant_id));
create policy entry_references_write on public.entry_references
  for all to authenticated
  using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));


-- -----------------------------------------------------------------------------
-- Versionen und Slugs · lesbar, aber nicht von Hand beschreibbar
--
-- Beides entsteht ausschliesslich beim Veröffentlichen über publish_entry().
-- Eine Versionshistorie, die der Kunde selbst beschreiben kann, taugt im
-- Supportfall nichts -- und ein frei setzbarer Slug-Verlauf würde die
-- Eindeutigkeit aushebeln.
-- -----------------------------------------------------------------------------
create policy entry_versions_select on public.entry_versions
  for select to authenticated using (public.is_tenant_member(tenant_id));

create policy entry_slugs_select on public.entry_slugs
  for select to authenticated using (public.is_tenant_member(tenant_id));
