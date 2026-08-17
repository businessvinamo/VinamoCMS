-- =============================================================================
-- Vinamo CMS · 0003 Grundbestand
--
-- Idempotent: darf beliebig oft laufen. Enthält bewusst keine Auth-Benutzer --
-- Zugriff wird auf die E-Mail-Adresse ausgestellt und beim ersten Anmelden
-- automatisch eingelöst (siehe handle_new_user in 0001). Damit liegen nirgends
-- geseedete Passwörter herum.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Testmandant · gehört Vinamo selbst. Jede neue Funktion wird hier zuerst
-- eingeschaltet, bevor ein zahlender Kunde sie sieht.
-- -----------------------------------------------------------------------------
insert into public.tenants (slug, name, locales, default_locale, branding)
values (
  'vinamo-test',
  'Vinamo Testmandant',
  array['de', 'fr', 'it', 'en'],
  'de',
  jsonb_build_object(
    'primary', '#5B3DF5',
    'ink',     '#1B1B33',
    'paper',   '#FBFAF9',
    'logo',    '/brand/svg/vinamo-logo-horizontal.svg'
  )
)
on conflict (slug) do nothing;

-- Zweiter Mandant, damit die Mandantentrennung von Anfang an an echten Daten
-- geprüft wird und nicht erst beim ersten Kunden auffällt.
insert into public.tenants (slug, name, locales, default_locale)
values ('demo-restaurant', 'Demo Restaurant', array['de', 'fr'], 'de')
on conflict (slug) do nothing;


-- -----------------------------------------------------------------------------
-- Funktionsschalter
--
-- Standardmässig aus. Eingeschaltet wird pro Mandant, sobald die zugehörige
-- Phase steht. kill_switch bleibt die Notbremse für alle gleichzeitig.
-- -----------------------------------------------------------------------------
insert into public.feature_flags (key, description, enabled_globally) values
  ('content_editor',   'Inhaltstypen pflegen, Entwurf und Veröffentlichung (Phase 2)', false),
  ('translations',     'Mehrsprachigkeit auf Feldebene mit Fallback (Phase 3)',        false),
  ('scheduling',       'Terminierung, Gültigkeitszeiträume und Plätze (Phase 3)',      false),
  ('public_read_api',  'Öffentliche Lese-API pro Mandant und Sprache (Phase 3)',       false),
  ('media_library',    'Mediathek, Upload und Bildvarianten (Phase 4)',                false),
  ('repeaters',        'Wiederholgruppen und Referenzen (Phase 5)',                    false)
on conflict (key) do nothing;

-- Der Testmandant sieht alles zuerst.
insert into public.tenant_feature_flags (tenant_id, flag_key, enabled)
select t.id, f.key, true
from public.tenants t
cross join public.feature_flags f
where t.slug = 'vinamo-test'
on conflict (tenant_id, flag_key) do nothing;


-- -----------------------------------------------------------------------------
-- Zugang Kevin Heutschi
--
-- Plattformadministrator (vinamo_admin) plus Besitzer des Testmandanten. Wird
-- beim ersten Anmelden per Magic Link automatisch eingelöst.
-- -----------------------------------------------------------------------------
insert into public.invitations (email, tenant_id, role, grants_platform_admin, expires_at)
select
  'kevin.heutschi@vinamo.ch',
  t.id,
  'owner',
  true,
  now() + interval '365 days'
from public.tenants t
where t.slug = 'vinamo-test'
on conflict do nothing;
