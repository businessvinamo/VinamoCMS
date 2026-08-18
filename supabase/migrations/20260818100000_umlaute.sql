-- =============================================================================
-- Vinamo CMS · 0021 Umlaute statt Behelfsschreibung
--
-- In den Seed-Daten stand durchgehend „Oeffnungszeiten", „Blogbeitraege",
-- „Regulaere Zeiten", „Getraenke". Das war Bequemlichkeit beim Schreiben der
-- Migrationen und stand danach in der Oberfläche des Kunden.
--
-- Für eine Wirtin in Bern liest sich „Oeffnungszeiten" wie ein Tippfehler --
-- und es ist einer. Postgres, JSON und die Lese-API können UTF-8 seit jeher;
-- es gab nie einen technischen Grund dafür.
--
-- Betroffen sind nur DATEN, kein Code: Der React-Teil war von Anfang an
-- korrekt. Genau deshalb fiel es lange nicht auf -- die Oberfläche sah sauber
-- aus, bis die Inhaltstypen darin auftauchten.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Inhaltstypen
-- -----------------------------------------------------------------------------
update public.content_types set
  name         = 'Öffnungszeiten',
  name_plural  = 'Öffnungszeiten',
  description  = 'Reguläre Zeiten und befristete Abweichungen wie Ferien.'
where key = 'opening_hours';

update public.content_types set
  description = 'Ein Abschnitt der Karte, z.B. Vorspeisen. Enthält die Gerichte.'
where key = 'menu_section';

update public.content_types set
  description = 'Aktuelles, Blogbeiträge, Mitteilungen.'
where key = 'news';


-- -----------------------------------------------------------------------------
-- Felder: Beschriftungen und Hilfetexte
-- -----------------------------------------------------------------------------
update public.fields f set
  label = 'Überschrift',
  help  = 'Zum Beispiel Vorspeisen oder Getränke.'
from public.content_types c
where c.id = f.content_type_id and c.key = 'menu_section' and f.key = 'name';

update public.fields f set help = 'Optionaler Text unter der Überschrift.'
from public.content_types c
where c.id = f.content_type_id and c.key = 'menu_section' and f.key = 'note';

update public.fields f set help = 'Mehrfachauswahl möglich.'
from public.content_types c
where c.id = f.content_type_id and c.key = 'menu_section' and f.key = 'allergens';

update public.fields f set help = 'Erscheint in der Übersicht und als Seitentitel.'
from public.content_types c
where c.id = f.content_type_id and c.key = 'news' and f.key = 'title';

update public.fields f set help = 'Ein bis zwei Sätze für die Übersicht.'
from public.content_types c
where c.id = f.content_type_id and c.key = 'news' and f.key = 'lead';

update public.fields f set help = 'Nur intern, z.B. Regulär oder Sommerferien.'
from public.content_types c
where c.id = f.content_type_id and c.key = 'opening_hours' and f.key = 'label';

update public.fields f set help = 'Überschreibt die Zeiten.'
from public.content_types c
where c.id = f.content_type_id and c.key = 'opening_hours' and f.key = 'closed';

update public.fields f set help = 'Leer lassen für auf Anfrage.'
from public.content_types c
where c.id = f.content_type_id and c.key = 'services' and f.key = 'price_from';

update public.fields f set help = 'Zum Beispiel Küchenchefin.'
from public.content_types c
where c.id = f.content_type_id and c.key = 'team' and f.key = 'role';

-- Allergene stehen in der Auswahlliste und landen direkt auf der Speisekarte.
update public.fields f set
  config = jsonb_set(f.config, '{options}', to_jsonb(array[
    'Gluten', 'Krebstiere', 'Eier', 'Fisch', 'Erdnuss', 'Soja', 'Milch',
    'Schalenfrüchte', 'Sellerie', 'Senf', 'Sesam', 'Schwefeldioxid',
    'Lupine', 'Weichtiere'
  ]))
from public.content_types c
where c.id = f.content_type_id and c.key = 'menu_section' and f.key = 'allergens';


-- -----------------------------------------------------------------------------
-- Branchen-Baukasten und Funktionsschalter
--
-- Die Funktionsschalter sieht nur noch Vinamo, aber auch dort gilt: Wenn schon
-- Deutsch, dann richtig.
-- -----------------------------------------------------------------------------
update public.blueprints set description = 'Speisekarte, Öffnungszeiten, Team, Neuigkeiten.'
where key = 'restaurant';
update public.blueprints set description = 'Leistungen, Öffnungszeiten, Team, Neuigkeiten.'
where key in ('coiffeur', 'praxis');

update public.feature_flags set description = 'Inhaltstypen pflegen, Entwurf und Veröffentlichung (Phase 2)'
where key = 'content_editor';
update public.feature_flags set description = 'Öffentliche Lese-API pro Mandant und Sprache (Phase 3)'
where key = 'public_read_api';
update public.feature_flags set description = 'Terminierung, Gültigkeitszeiträume und Plätze (Phase 3)'
where key = 'scheduling';


-- -----------------------------------------------------------------------------
-- Wachposten
--
-- Damit sich die Behelfsschreibung nicht zurückschleicht: Neue Inhaltstypen mit
-- „ae"/„oe"/„ue" mitten im Wort werden abgelehnt. Der Constraint ist bewusst eng
-- gefasst -- er trifft die drei Muster, die hier tatsächlich vorkamen, und lässt
-- echte Wörter wie „Aktuelles", „Neue" oder „Museum" in Ruhe.
-- -----------------------------------------------------------------------------
alter table public.content_types
  add constraint content_types_keine_behelfsumlaute
  check (
    name        !~ '(Oe|Ue|Ae)[a-zäöüß]' and
    name_plural !~ '(Oe|Ue|Ae)[a-zäöüß]' and
    description !~ '(Oe|Ue|Ae)[a-zäöüß]'
  );

comment on constraint content_types_keine_behelfsumlaute on public.content_types is
  'Verhindert Oeffnungszeiten & Co. Umlaute schreibt man als Umlaute -- was hier
   steht, liest der Kunde.';
