-- =============================================================================
-- Vinamo CMS · 0025 Schlüssel sind keine Beschriftungen
--
-- Zwei Rückmeldungen aus dem Bau der ersten Kundenwebsite, beide derselbe
-- Fehler: An zwei Stellen war der gespeicherte Wert gleichzeitig das, was der
-- Gast liest.
--
-- BEFUND 1 · Wochentage
-- ---------------------
-- `day` war eine Auswahl mit den Werten „Montag" … „Sonntag". Auf der
-- französischen Seite lieferte die API deshalb deutsche Wochentage, und der
-- Website-Bauer musste deutsche Wörter übersetzen statt Schlüssel abzubilden.
-- Neu sind die Werte `mon` … `sun`; was im Editor steht, kommt aus
-- config.option_labels.
--
-- BEFUND 2 · Team-Bereich
-- -----------------------
-- `group` war ein ÜBERSETZBARES Freitextfeld und diente gleichzeitig als
-- Gruppierungsschlüssel. Sobald jemand nur einen von zwei Küchenmitarbeitenden
-- übersetzte, zerfiel die Küche auf der französischen Seite in zwei Blöcke:
-- „Cuisine" mit einer Person, „Küche" mit der anderen. Kein Codefehler --
-- die Website gruppierte genau nach dem gelieferten Wert --, sondern ein Modell,
-- das den Fehler unvermeidlich macht.
--
-- Ein Gruppierungsschlüssel gehört nicht übersetzt. Wer französische
-- Bereichsnamen will, bildet sie auf der Website ab -- so wie die Wochentage
-- auch. Die Alternative wäre ein zweites Feld „Bereich (französisch)" gewesen:
-- ein Feld mehr in jeder Maske, das neun von zehn Kunden leer lassen.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Wochentage auf stabile Schlüssel
-- -----------------------------------------------------------------------------
update public.fields f set
  config = jsonb_build_object(
    'options', to_jsonb(array['mon','tue','wed','thu','fri','sat','sun']),
    'option_labels', jsonb_build_object(
      'mon','Montag', 'tue','Dienstag', 'wed','Mittwoch', 'thu','Donnerstag',
      'fri','Freitag', 'sat','Samstag', 'sun','Sonntag'))
from public.content_types c
where c.id = f.content_type_id and c.key = 'opening_hours' and f.key = 'day';

-- Bestandsdaten mitnehmen. Was sich nicht zuordnen lässt, wird NULL -- ein
-- unbekannter Wochentag ist keine Angabe, die man raten sollte.
create or replace function public.wochentag_schluessel(p_roh text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(btrim(coalesce(p_roh, '')))
    when 'montag'     then 'mon' when 'mon' then 'mon'
    when 'dienstag'   then 'tue' when 'tue' then 'tue'
    when 'mittwoch'   then 'wed' when 'wed' then 'wed'
    when 'donnerstag' then 'thu' when 'thu' then 'thu'
    when 'freitag'    then 'fri' when 'fri' then 'fri'
    when 'samstag'    then 'sat' when 'sat' then 'sat'
    when 'sonntag'    then 'sun' when 'sun' then 'sun'
    else null
  end;
$$;

update public.entries e
set field_values = jsonb_set(
      e.field_values, '{hours}',
      (select coalesce(jsonb_agg(
                zeile || jsonb_build_object('day', public.wochentag_schluessel(zeile ->> 'day'))
              ), '[]'::jsonb)
       from jsonb_array_elements(e.field_values -> 'hours') zeile))
from public.content_types c
where c.id = e.content_type_id and c.key = 'opening_hours'
  and jsonb_typeof(e.field_values -> 'hours') = 'array';

-- Auch die bereits veröffentlichten Schnappschüsse: Sonst liefert die API
-- weiterhin „Montag", weil sie aus der Version liest und nicht aus dem Entwurf.
update public.entry_versions v
set snapshot = jsonb_set(
      v.snapshot, '{field_values,hours}',
      (select coalesce(jsonb_agg(
                zeile || jsonb_build_object('day', public.wochentag_schluessel(zeile ->> 'day'))
              ), '[]'::jsonb)
       from jsonb_array_elements(v.snapshot -> 'field_values' -> 'hours') zeile))
from public.entries e
join public.content_types c on c.id = e.content_type_id
where e.id = v.entry_id and c.key = 'opening_hours'
  and jsonb_typeof(v.snapshot -> 'field_values' -> 'hours') = 'array';


-- -----------------------------------------------------------------------------
-- 2 · Team-Bereich ist eine Zuordnung, keine Übersetzung
-- -----------------------------------------------------------------------------

-- Zuerst die Werte retten: Sie liegen bisher in der Übersetzung der
-- Hauptsprache, künftig gehören sie an den Eintrag selbst.
update public.entries e
set field_values = e.field_values || jsonb_build_object('group', t.field_values ->> 'group')
from public.content_types c, public.tenants tn, public.entry_translations t
where c.id = e.content_type_id and c.key = 'team'
  and tn.id = e.tenant_id
  and t.entry_id = e.id and t.locale = tn.default_locale
  and t.field_values ? 'group';

update public.entry_versions v
set snapshot = jsonb_set(
      v.snapshot, '{field_values,group}',
      to_jsonb(v.snapshot #>> array['translations', tn.default_locale, 'field_values', 'group']))
from public.entries e
join public.content_types c on c.id = e.content_type_id
join public.tenants tn on tn.id = e.tenant_id
where e.id = v.entry_id and c.key = 'team'
  and v.snapshot #>> array['translations', tn.default_locale, 'field_values', 'group'] is not null;

update public.fields f set
  translatable = false,
  help = 'Optional. Gleiche Schreibweise gruppiert, z.B. Küche oder Service. Wird nicht übersetzt — die Website bildet Bereichsnamen selbst ab.'
from public.content_types c
where c.id = f.content_type_id and c.key = 'team' and f.key = 'group';

-- Die übersetzten Bereichsnamen aus den Übersetzungen entfernen: Sie wären ab
-- jetzt tote Daten, die niemand mehr pflegt, aber jeder Export mitschleppt.
update public.entry_translations t
set field_values = t.field_values - 'group'
from public.entries e
join public.content_types c on c.id = e.content_type_id
where e.id = t.entry_id and c.key = 'team' and t.field_values ? 'group';

-- Und dasselbe in den veröffentlichten Schnappschüssen. Ohne das liefert die API
-- weiterhin „Cuisine" für Anna: Sie liest aus der Version, und die trägt die
-- Übersetzung, die den Basiswert beim Zusammenführen überschreibt.
update public.entry_versions v
set snapshot = jsonb_set(
      v.snapshot, '{translations}',
      (select coalesce(jsonb_object_agg(locale, inhalt #- '{field_values,group}'), '{}'::jsonb)
       from jsonb_each(v.snapshot -> 'translations') as t(locale, inhalt)))
from public.entries e
join public.content_types c on c.id = e.content_type_id
where e.id = v.entry_id and c.key = 'team'
  and jsonb_typeof(v.snapshot -> 'translations') = 'object';
