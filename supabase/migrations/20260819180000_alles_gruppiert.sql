-- =============================================================================
-- Vinamo CMS · 0026 Jeder Inhaltstyp gehört zu einer Gruppe
--
-- Nach 0024 hatten zwei Paare eine Gruppe und drei Typen keine. In der neuen
-- Tafel-Darstellung (Entscheid 39) fiel auf, was vorher im Einzug unterging:
--
--   [SPEISEKARTE]  Abschnitte · Karte als PDF
--                  Neuigkeiten            <- ohne Band, zwischen zwei Gruppen
--   [ÖFFNUNGSZEITEN] Reguläre Zeiten · Ferien
--                  Leistungen             <- ohne Band
--                  Team                   <- ohne Band
--
-- „Neuigkeiten" sitzt zwischen zwei beschrifteten Gruppen und liest sich dadurch
-- wie etwas, das durchgerutscht ist -- dabei ist es der Typ, den ein Wirt am
-- häufigsten anfasst. Eine halb gruppierte Liste ist unruhiger als eine gar
-- nicht gruppierte: Das Auge sucht nach dem System und findet eine Ausnahme.
--
-- WARUM NICHT „WEITERE INHALTE"
-- -----------------------------
-- Naheliegend wäre ein Sammelband für alles Übrige. Ein solcher Name ist eine
-- Schublade, und Schubladen wachsen: Jeder neue Typ, für den niemand kurz
-- nachdenkt, landet dort, bis „Weitere Inhalte" der grösste Bereich ist.
--
-- Stattdessen bekommt jeder Typ einen Bereich, der ihn wirklich beschreibt --
-- und jeder künftige Typ hat damit von vornherein ein Zuhause.
--
-- WARUM DIE NAMEN SICH VOM TYP UNTERSCHEIDEN
-- ------------------------------------------
-- Die Gruppe trägt das THEMA, der Eintrag die SACHE (Entscheid 24). „Aktuelles"
-- über „Neuigkeiten" ist deshalb keine Doppelung, sondern die Ebene darüber:
-- Kommen später Veranstaltungen dazu, stehen sie ohne Umbau daneben. Eine
-- Gruppe „Neuigkeiten", die „Neuigkeiten" enthält, läse sich dagegen wie ein
-- Fehler.
--
-- Die Reihenfolge bleibt unverändert -- die Gruppen entstehen genau dort, wo die
-- Typen ohnehin schon standen. Kein Eintrag wandert, niemand muss neu suchen.
-- =============================================================================

update public.content_types set group_label = 'Aktuelles'
where key = 'news';

update public.content_types set group_label = 'Über den Betrieb'
where key in ('services', 'team');

comment on column public.content_types.group_label is
  'Überschrift, unter der dieser Typ in der Kundenübersicht steht. Gleiche
   Beschriftung bei DIREKT AUFEINANDERFOLGENDEN Typen ergibt eine Gruppe.
   Seit 0026 hat jeder ausgelieferte Typ eine -- eine halb gruppierte Liste ist
   unruhiger als eine ungruppierte. NULL bleibt erlaubt und heisst „steht für
   sich"; wer einen Typ ohne Bereich anlegt, soll das können.';
