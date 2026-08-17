-- =============================================================================
-- Vinamo CMS · 0016 Zeitsteuerung nur dort, wo sie Sinn ergibt
--
-- Der Editor zeigte den Abschnitt "Zeitsteuerung" bei JEDEM Inhaltstyp. Bei
-- einer Neuigkeit oder einer Speisekarte ist das richtig; bei Team und
-- Leistungen ist es Ballast -- niemand plant eine Mitarbeiterin für den
-- 14. März und archiviert sie im April.
--
-- Der Fehler war nicht die Anzeige, sondern dass die Komponente alle Typen
-- gleich behandelt hat. Ob ein Typ terminierbar ist, ist eine Eigenschaft des
-- Typs und gehört deshalb in die Daten -- wie alles andere auch.
-- =============================================================================

alter table public.content_types
  add column supports_scheduling boolean not null default true;

comment on column public.content_types.supports_scheduling is
  'Zeigt der Editor "Sichtbar ab / Sichtbar bis"? Aus für Typen, deren Einträge
   einfach da sind (Team, Leistungen). An für alles, was einen Zeitbezug hat.';

-- Ein Platz ohne Gültigkeitszeitraum ist sinnlos: Plätze lösen genau die Frage
-- "welcher Eintrag gilt gerade", und ohne Zeitraum gilt immer derselbe.
alter table public.content_types
  add constraint content_types_slots_need_scheduling
  check (not supports_slots or supports_scheduling);

update public.content_types
set supports_scheduling = false
where key in ('team', 'services');
