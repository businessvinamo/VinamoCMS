-- =============================================================================
-- Vinamo CMS · 0023 Speisekarte, Öffnungszeiten, Medien
--
-- Sammelmigration aus einem Durchgang durch die Inhaltstypen mit dem Kunden.
-- Alles hier ist Konfiguration -- kein Inhaltstyp bekommt Code, kein Kunde eine
-- Sonderbehandlung.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Währung gehört zum Mandanten, nicht zum Feld
--
-- Die Währung stand als config.currency = 'CHF' an jedem Preisfeld. Damit hätte
-- ein Kunde in Konstanz seine Preise in Franken ausgezeichnet -- und ändern
-- liesse sich das nur global für alle. Die Währung ist eine Eigenschaft des
-- Betriebs, nicht des Feldes.
-- -----------------------------------------------------------------------------
alter table public.tenants
  add column currency text not null default 'CHF'
  constraint tenants_currency check (currency in ('CHF', 'EUR'));

comment on column public.tenants.currency is
  'Währung aller Preisfelder dieses Mandanten. Zwei reichen: CHF und EUR decken
   den DACH-Raum ab. Eine dritte ist eine Zeile hier, kein Umbau.';

update public.fields set config = config - 'currency' where type = 'price';


-- -----------------------------------------------------------------------------
-- 2 · Allergene: eigene ergänzen
--
-- Die vierzehn Positionen sind die gesetzliche Liste (CH: Allergenverordnung,
-- EU: LMIV Anhang II). Sie bleiben deshalb vollständig stehen -- eine Kürzung
-- wäre kein Aufräumen, sondern eine Lücke in der Deklaration.
--
-- Was gefehlt hat, ist die Möglichkeit, etwas EIGENES zu ergänzen: „Alkohol",
-- „scharf", „vegan" stehen auf jeder zweiten Karte und in keiner Verordnung.
-- Deshalb creatable: Die Liste ist Vorschlag, nicht Zaun.
--
-- Die Reihenfolge ist neu nach Häufigkeit statt nach Verordnungsnummer -- was
-- die Wirtin zehnmal am Tag antippt, steht vorn.
-- -----------------------------------------------------------------------------
update public.fields f set
  config = jsonb_build_object(
    'creatable', true,
    'options', to_jsonb(array[
      'Gluten', 'Milch', 'Eier', 'Schalenfrüchte',
      'Soja', 'Fisch', 'Krebstiere', 'Weichtiere', 'Erdnuss',
      'Sellerie', 'Senf', 'Sesam', 'Schwefeldioxid', 'Lupine'
    ])
  ),
  help = 'Mehrfachauswahl. Eigene Angaben wie „scharf" oder „vegan" kannst du unten ergänzen.'
from public.content_types c
where c.id = f.content_type_id and c.key = 'menu_section' and f.key = 'allergens';


-- -----------------------------------------------------------------------------
-- 3 · Öffnungszeiten sind Uhrzeiten, kein Freitext
--
-- „Von" und „Bis" waren Textfelder. Eintragbar war damit „09", „9h", „morgens"
-- und „X" -- alles davon unverändert auf der Kundenwebsite.
-- -----------------------------------------------------------------------------
update public.fields f set type = 'time', help = ''
from public.content_types c
where c.id = f.content_type_id and c.key = 'opening_hours' and f.key in ('from', 'to');

-- Bestehende Werte mitnehmen, soweit sie sich deuten lassen: „9" und „09" werden
-- „09:00", „9:30" wird „09:30". Alles andere wird geleert -- ein „X" in einem
-- Zeitfeld stehen zu lassen hiesse, den Fehler zu konservieren.
create or replace function public.zeit_normalisiert(p_roh text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    -- 9 · 09 · 9h -> 09:00
    when p_roh ~ '^\s*([01]?[0-9]|2[0-3])\s*h?\s*$'
      then lpad(regexp_replace(p_roh, '\D', '', 'g'), 2, '0') || ':00'
    -- 9:30 · 09.30 · 9 30 -> 09:30
    when p_roh ~ '^\s*([01]?[0-9]|2[0-3])\s*[:.\s]\s*[0-5][0-9]\s*$'
      then lpad(split_part(regexp_replace(btrim(p_roh), '[.\s]', ':', 'g'), ':', 1), 2, '0')
           || ':' || split_part(regexp_replace(btrim(p_roh), '[.\s]', ':', 'g'), ':', 2)
    -- 0930 -> 09:30
    when p_roh ~ '^\s*([01][0-9]|2[0-3])[0-5][0-9]\s*$'
      then substr(btrim(p_roh), 1, 2) || ':' || substr(btrim(p_roh), 3, 2)
    else null
  end;
$$;

comment on function public.zeit_normalisiert(text) is
  'Deutet eine getippte Uhrzeit oder gibt NULL zurück. Absichtlich streng: Was
   sich nicht eindeutig deuten lässt, wird nicht geraten.';

update public.entries e
set field_values = jsonb_set(
      e.field_values, '{hours}',
      (select coalesce(jsonb_agg(
                zeile
                || jsonb_build_object('from', public.zeit_normalisiert(zeile ->> 'from'))
                || jsonb_build_object('to',   public.zeit_normalisiert(zeile ->> 'to'))
              ), '[]'::jsonb)
       from jsonb_array_elements(e.field_values -> 'hours') zeile))
from public.content_types c
where c.id = e.content_type_id and c.key = 'opening_hours'
  and jsonb_typeof(e.field_values -> 'hours') = 'array';


-- -----------------------------------------------------------------------------
-- 4 · Ferien und besondere Tage als eigener Inhaltstyp
--
-- Technisch liessen sie sich schon vorher abbilden: ein zweiter Eintrag im
-- selben Platz, mit Rangzahl und Gültigkeitszeitraum. Für die Wirtin war das
-- unauffindbar -- sie hätte Plätze und Rangzahlen verstehen müssen, um „1.
-- August geschlossen" einzutragen.
--
-- WARUM VON/BIS ALS FELDER UND NICHT ALS ZEITSTEUERUNG
-- ----------------------------------------------------
-- Die Zeitsteuerung blendet einen Eintrag ein und aus. Für Betriebsferien ist
-- genau das falsch: „Wir sind vom 20.7. bis 4.8. geschlossen" muss VORHER auf
-- der Website stehen, nicht erst am 20.7. erscheinen. Deshalb sind Von und Bis
-- hier gewöhnliche Datumsfelder, und die Website entscheidet, was sie ankündigt
-- und was sie anwendet.
-- -----------------------------------------------------------------------------
do $$
declare v_typ uuid; v_zeiten uuid;
begin
  insert into public.content_types (key, name, name_plural, kind, sortable, supports_scheduling, description)
  values ('opening_exceptions', 'Ferien oder besonderer Tag', 'Ferien und besondere Tage',
          'collection', false, false,
          'Betriebsferien, Feiertage und einzelne Ausnahmen von den regulären Zeiten.')
  returning id into v_typ;

  insert into public.fields (content_type_id, key, type, label, help, translatable, required, position)
  values
    (v_typ, 'label', 'text', 'Bezeichnung',
     'Was der Gast liest, z.B. Sommerferien oder Bundesfeier.', true, true, 0),
    (v_typ, 'from', 'date', 'Von', 'Erster betroffener Tag.', false, true, 1),
    (v_typ, 'to', 'date', 'Bis', 'Letzter betroffener Tag. Bei einem einzelnen Tag derselbe wie Von.', false, true, 2),
    (v_typ, 'closed', 'boolean', 'Ganztags geschlossen',
     'Ist der Betrieb an diesen Tagen offen, aber zu anderen Zeiten, lass dies aus und trag die Zeiten unten ein.',
     false, false, 3),
    (v_typ, 'note', 'textarea', 'Hinweis',
     'Optionaler Satz für die Website, z.B. Bestellungen weiterhin per Telefon.', true, false, 4);

  insert into public.fields (content_type_id, key, type, label, help, translatable, required, position)
  values (v_typ, 'hours', 'repeater', 'Abweichende Zeiten',
          'Nur nötig, wenn an diesen Tagen andere Zeiten gelten als sonst.', false, false, 5)
  returning id into v_zeiten;

  insert into public.fields (content_type_id, parent_field_id, key, type, label, translatable, required, position)
  values
    (v_typ, v_zeiten, 'from', 'time', 'Von', false, false, 0),
    (v_typ, v_zeiten, 'to',   'time', 'Bis', false, false, 1);
end $$;


-- -----------------------------------------------------------------------------
-- 5 · Wochenkarte als PDF
--
-- Nicht jeder Betrieb will jedes Gericht einzeln erfassen. Wer seine Wochenkarte
-- ohnehin in Word schreibt und als PDF verschickt, soll sie hochladen können --
-- und trotzdem eine Website haben, auf der sie aktuell ist.
--
-- Der Preis dafür steht ausdrücklich im Hilfetext: Ein PDF ist für Suchmaschinen
-- und auf dem Handy schlechter als eine echte Karte. Der Kunde soll die Wahl
-- bewusst treffen, nicht aus Unwissen.
-- -----------------------------------------------------------------------------
do $$
declare v_typ uuid;
begin
  insert into public.content_types (key, name, name_plural, kind, sortable, supports_scheduling, description)
  values ('menu_document', 'Karte als Datei', 'Karte als Datei',
          'collection', false, true,
          'Speise- oder Wochenkarte als PDF, statt jedes Gericht einzeln zu erfassen.')
  returning id into v_typ;

  insert into public.fields (content_type_id, key, type, label, help, translatable, required, position)
  values
    (v_typ, 'title', 'text', 'Bezeichnung',
     'Was auf dem Knopf steht, z.B. Wochenkarte KW 34.', true, true, 0),
    (v_typ, 'document', 'file', 'Datei',
     'PDF, höchstens 15 MB. Tipp: Eine getippte Karte findet Google, ein PDF nur schlecht — und auf dem Handy muss der Gast hineinzoomen.',
     false, true, 1),
    (v_typ, 'note', 'textarea', 'Hinweis', 'Optionaler Satz darunter.', true, false, 2);
end $$;


-- -----------------------------------------------------------------------------
-- 6 · News: ein Häkchen zum Hervorheben, kein Autorenfeld
--
-- „Hervorheben" beantwortet eine Frage, die jede Kundenwebsite hat: Welche
-- Neuigkeit steht auf der Startseite? Ohne das Häkchen kann die Website nur „die
-- neueste" zeigen -- und die Ankündigung des Sonntagsbrunchs verschwindet, sobald
-- jemand eine Kleinigkeit nachschiebt.
--
-- Ein Autorenfeld gibt es bewusst NICHT. Bei einem KMU schreibt der Betrieb,
-- nicht eine Person; das Feld bliebe bei neun von zehn Kunden leer und wäre für
-- den zehnten ein Textfeld, das er auch in den Kurztext schreiben kann. Ein Feld,
-- das meistens leer ist, macht jede Maske länger und keine Website besser.
-- -----------------------------------------------------------------------------
insert into public.fields (content_type_id, key, type, label, help, translatable, required, position)
select c.id, 'highlight', 'boolean', 'Auf der Startseite hervorheben',
       'Bleibt oben, auch wenn neuere Beiträge dazukommen.', false, false, 5
from public.content_types c where c.key = 'news';


-- -----------------------------------------------------------------------------
-- 7 · Die neuen Typen ins Restaurant-Set und in den Testmandanten
-- -----------------------------------------------------------------------------
insert into public.blueprint_content_types (blueprint_key, content_type_id, position)
select 'restaurant', c.id, 10 + row_number() over (order by c.key)
from public.content_types c
where c.key in ('opening_exceptions', 'menu_document')
on conflict do nothing;

insert into public.blueprint_content_types (blueprint_key, content_type_id, position)
select b.key, c.id, 10
from public.blueprints b cross join public.content_types c
where b.key in ('coiffeur', 'praxis') and c.key = 'opening_exceptions'
on conflict do nothing;

insert into public.tenant_content_types (tenant_id, content_type_id, position)
select t.id, c.id, 10 + row_number() over (order by c.key)
from public.tenants t cross join public.content_types c
where t.slug = 'vinamo-test' and c.key in ('opening_exceptions', 'menu_document')
on conflict do nothing;


-- -----------------------------------------------------------------------------
-- 8 · Team: Gruppen statt einer langen Liste
--
-- Ab etwa acht Personen ist eine flache Liste keine Gliederung mehr. „Bereich"
-- ist ein freies, übersetzbares Textfeld -- Küche, Service, Geschäftsleitung,
-- Lernende: Jeder Betrieb benennt seine Gruppen selbst, und die Website
-- gruppiert danach. Eine feste Auswahlliste hiesse, dass Vinamo entscheidet,
-- wie ein Coiffeursalon gegliedert ist.
--
-- KEINE SORTIERUNG NACH NACHNAMEN
-- -------------------------------
-- Naheliegend, aber für einen KMU falsch: Auf einer Teamseite steht der Chef
-- vorn und die Lernende hinten, nicht Aebi vor Zumsteg. Alphabetisch zu
-- sortieren ist die Konvention grosser Organisationen. Innerhalb der Gruppe
-- bleibt deshalb die selbst gewählte Reihenfolge -- dafür gibt es jetzt Pfeile
-- in der Liste.
--
-- Aus demselben Grund bleibt der Name EIN Feld: „Anna Meier" ist, was auf der
-- Website steht. Vorname und Nachname zu trennen kostet die Wirtin bei jeder
-- Person einen zusätzlichen Handgriff und gewinnt nur eine Sortierung, die hier
-- niemand will.
-- -----------------------------------------------------------------------------
insert into public.fields (content_type_id, key, type, label, help, translatable, required, position)
select c.id, 'group', 'text', 'Bereich',
       'Optional. Gleiche Bezeichnung gruppiert, z.B. Küche oder Service.', true, false, 4
from public.content_types c where c.key = 'team';
