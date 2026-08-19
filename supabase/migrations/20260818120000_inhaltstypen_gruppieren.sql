-- =============================================================================
-- Vinamo CMS · 0024 Zusammengehörende Inhaltstypen gruppieren
--
-- Nach 0023 standen sieben Inhaltstypen als flache Liste nebeneinander, und
-- zwei Paare, die zusammengehören, waren durch fremde Einträge getrennt:
--
--   Leistungen · Speisekarte · Neuigkeiten · Öffnungszeiten · Team ·
--   Karte als Datei · Ferien und besondere Tage
--
-- „Speisekarte" und „Karte als Datei" sind ZWEI WEGE zur selben Sache -- der
-- Kunde wählt einen. „Öffnungszeiten" und „Ferien" sind Regel und AUSNAHME --
-- er braucht beide. In beiden Fällen muss die Beziehung sichtbar sein, sonst
-- übersieht der Wirt, dass es die PDF-Variante überhaupt gibt, und sucht die
-- Betriebsferien in den Öffnungszeiten.
--
-- WARUM EINE GRUPPE UND NICHT EIN ZUSAMMENGELEGTER TYP
-- ----------------------------------------------------
-- Naheliegend wäre, Speisekarte und PDF in einen Typ zu legen, mit beiden
-- Feldern. Das ergäbe eine Maske, in der die Hälfte immer leer bleibt, und die
-- Frage „was gilt jetzt, die Gerichte oder das PDF?" wäre nicht mehr
-- beantwortbar. Zwei Typen, eine Gruppe: Die Wahl bleibt sichtbar und
-- eindeutig.
--
-- Die Gruppe ist DATEN, kein Code -- eine Spalte, kein Sonderfall in der
-- Oberfläche.
-- =============================================================================

alter table public.content_types add column group_label text;

comment on column public.content_types.group_label is
  'Überschrift, unter der dieser Typ in der Kundenübersicht steht. NULL heisst
   „steht für sich" -- der Normalfall. Gleiche Beschriftung = eine Gruppe.';


-- -----------------------------------------------------------------------------
-- Namen entdoppeln
--
-- Eine Gruppe „Speisekarte", die einen Eintrag „Speisekarte" enthält, liest sich
-- wie ein Fehler. Die Gruppe trägt das Thema, die Einträge tragen den Weg.
-- Nebenbei wird es klarer: Was der Kunde unter menu_section anlegt, sind
-- Abschnitte -- Vorspeisen, Hauptgänge --, nicht „die Speisekarte".
-- -----------------------------------------------------------------------------
update public.content_types set
  name        = 'Abschnitt',
  name_plural = 'Abschnitte',
  group_label = 'Speisekarte',
  description = 'Ein Abschnitt der Karte, z.B. Vorspeisen — mit Gericht, Preis und Allergenen.'
where key = 'menu_section';

update public.content_types set
  name        = 'Karte als PDF',
  name_plural = 'Karte als PDF',
  group_label = 'Speisekarte',
  description = 'Fertige Karte hochladen, statt jedes Gericht einzeln zu erfassen.'
where key = 'menu_document';

update public.content_types set
  name        = 'Reguläre Zeiten',
  name_plural = 'Reguläre Zeiten',
  group_label = 'Öffnungszeiten',
  description = 'Der wöchentliche Rhythmus — was normalerweise gilt.'
where key = 'opening_hours';

update public.content_types set
  group_label = 'Öffnungszeiten',
  description = 'Betriebsferien, Feiertage und einzelne Ausnahmen von den regulären Zeiten.'
where key = 'opening_exceptions';


-- -----------------------------------------------------------------------------
-- Reihenfolge aufräumen
--
-- Die Positionen waren historisch gewachsen (row_number über den Schlüssel, neue
-- Typen mit 10+n hinten angehängt). Neu steht vorn, was der Kunde täglich
-- braucht, und Gruppenmitglieder liegen beieinander.
-- -----------------------------------------------------------------------------
create or replace function public.standard_position(p_key text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_key
    when 'menu_section'       then 0
    when 'menu_document'      then 1
    when 'news'               then 2
    when 'opening_hours'      then 3
    when 'opening_exceptions' then 4
    when 'services'           then 5
    when 'team'               then 6
    else 99
  end;
$$;

comment on function public.standard_position(text) is
  'Vorgabereihenfolge der Inhaltstypen in der Kundenübersicht. Pro Mandant
   überschreibbar über tenant_content_types.position -- hier steht nur, was ohne
   besondere Wünsche gilt.';

update public.tenant_content_types tct
set position = public.standard_position(c.key)
from public.content_types c
where c.id = tct.content_type_id;

update public.blueprint_content_types bct
set position = public.standard_position(c.key)
from public.content_types c
where c.id = bct.content_type_id;
