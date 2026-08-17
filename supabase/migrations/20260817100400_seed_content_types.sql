-- =============================================================================
-- Vinamo CMS · 0013 Inhaltstypen und Branchen-Baukasten
--
-- Alle Typen sind Daten. Ein neuer Inhaltstyp ist ein INSERT hier, kein Deploy.
--
-- -------------------------------------------------------------------------
-- Zur Speisekarte, weil die Spezifikation hier an eine Grenze stösst
-- -------------------------------------------------------------------------
-- Gefordert war: "Eine Speisekarte ist eine Liste von Kategorien, jede mit einer
-- Liste aus Gericht / Beschreibung / Preis / Allergene." Das sind zwei Ebenen
-- Verschachtelung -- eine Wiederholgruppe in einer Wiederholgruppe. 0009 verbietet
-- das ausdrücklich, aus zwei Gründen: auf einem Handy ist eine doppelt
-- verschachtelte Liste nicht mehr bedienbar, und im Datenmodell wird die
-- Zuordnung von Übersetzungen zu Zeilen doppelt indirekt.
--
-- Aufgelöst wird das, indem die Kategorie selbst zum Eintrag wird:
-- menu_section ist eine sortierbare Sammlung, jeder Eintrag eine Kategorie mit
-- EINER Wiederholgruppe von Gerichten. Fachlich identisch, aber:
--
--   * Kategorien lassen sich per Drag & Drop sortieren, weil sie Einträge sind
--   * jede Kategorie ist ein eigener Bildschirm statt einer Riesenliste
--   * eine einzelne Kategorie kann terminiert werden -- "Spargelkarte nur im Mai"
--     ist damit möglich, ohne die ganze Speisekarte zu duplizieren
--   * Plätze funktionieren pro Kategorie: die Saison-Vorspeisen verdrängen die
--     regulären Vorspeisen, der Rest der Karte bleibt stehen
-- =============================================================================

do $$
declare
  ct_news    uuid;
  ct_menu    uuid;
  ct_hours   uuid;
  ct_team    uuid;
  ct_service uuid;
  f_parent   uuid;
begin

  ------------------------------------------------------------------------------
  -- News · der Pilot-Inhaltstyp
  ------------------------------------------------------------------------------
  insert into public.content_types (key, name, name_plural, kind, sortable, has_slug, description)
  values ('news', 'Neuigkeit', 'Neuigkeiten', 'collection', false, true,
          'Aktuelles, Blogbeiträge, Mitteilungen.')
  on conflict (key) do nothing;
  select id into ct_news from public.content_types where key = 'news';

  insert into public.fields (content_type_id, key, type, label, help, required, translatable, position)
  select ct_news, v.key, v.type::public.field_type, v.label, v.help, v.required, v.translatable, v.pos
  from (values
    ('title',        'text',     'Titel',        'Erscheint in der Übersicht und als Seitentitel.', true,  true,  0),
    ('lead',         'textarea', 'Kurztext',     'Ein bis zwei Sätze für die Übersicht.',           false, true,  1),
    ('body',         'richtext', 'Text',         '',                                                false, true,  2),
    ('published_on', 'date',     'Datum',        'Wird auf der Website angezeigt.',                 false, false, 3),
    ('image',        'media',    'Bild',         '',                                                false, false, 4)
  ) as v(key, type, label, help, required, translatable, pos)
  where not exists (select 1 from public.fields f where f.content_type_id = ct_news and f.key = v.key);


  ------------------------------------------------------------------------------
  -- Speisekarten-Kategorie
  ------------------------------------------------------------------------------
  insert into public.content_types (key, name, name_plural, kind, sortable, has_slug, supports_slots, description)
  values ('menu_section', 'Kartenabschnitt', 'Speisekarte', 'collection', true, false, true,
          'Ein Abschnitt der Karte, z.B. Vorspeisen. Enthält die Gerichte.')
  on conflict (key) do nothing;
  select id into ct_menu from public.content_types where key = 'menu_section';

  insert into public.fields (content_type_id, key, type, label, help, required, translatable, position)
  select ct_menu, v.key, v.type::public.field_type, v.label, v.help, v.required, v.translatable, v.pos
  from (values
    ('name', 'text',     'Überschrift', 'Zum Beispiel Vorspeisen oder Getränke.', true,  true,  0),
    ('note', 'textarea', 'Hinweis',     'Optionaler Text unter der Überschrift.', false, true,  1)
  ) as v(key, type, label, help, required, translatable, pos)
  where not exists (select 1 from public.fields f where f.content_type_id = ct_menu and f.key = v.key);

  -- Die Wiederholgruppe. Ihre Zeilen bekommen beim Anlegen eine stabile ID --
  -- Übersetzungen verbinden sich darüber, niemals über die Position im Array.
  insert into public.fields (content_type_id, key, type, label, help, position)
  select ct_menu, 'dishes', 'repeater', 'Gerichte', 'Zeilen lassen sich per Ziehen sortieren.', 2
  where not exists (select 1 from public.fields f where f.content_type_id = ct_menu and f.key = 'dishes');
  select id into f_parent from public.fields where content_type_id = ct_menu and key = 'dishes';

  insert into public.fields (content_type_id, parent_field_id, key, type, label, help, required, translatable, config, position)
  select ct_menu, f_parent, v.key, v.type::public.field_type, v.label, v.help, v.required, v.translatable, v.config::jsonb, v.pos
  from (values
    ('dish',        'text',        'Gericht',     '',                              true,  true,  '{}', 0),
    ('description', 'textarea',    'Beschreibung','Zutaten oder Zubereitung.',      false, true,  '{}', 1),
    ('price',       'price',       'Preis',       'In Franken, z.B. 24.50.',        false, false, '{"currency":"CHF"}', 2),
    ('allergens',   'multiselect', 'Allergene',   'Mehrfachauswahl möglich.',       false, false,
      '{"options":["Gluten","Krebstiere","Eier","Fisch","Erdnuss","Soja","Milch","Schalenfruechte","Sellerie","Senf","Sesam","Schwefeldioxid","Lupine","Weichtiere"]}', 3)
  ) as v(key, type, label, help, required, translatable, config, pos)
  where not exists (
    select 1 from public.fields f where f.content_type_id = ct_menu and f.parent_field_id = f_parent and f.key = v.key
  );


  ------------------------------------------------------------------------------
  -- Öffnungszeiten · Einzelseite mit Plätzen
  --
  -- Plätze sind hier der Grund, warum "Ferienöffnungszeiten" kein Sonderfall ist:
  -- Ein zweiter Eintrag mit Gültigkeitszeitraum und höherer Priorität verdrängt
  -- die regulären Zeiten und läuft danach automatisch aus.
  ------------------------------------------------------------------------------
  insert into public.content_types (key, name, name_plural, kind, sortable, supports_slots, description)
  values ('opening_hours', 'Öffnungszeiten', 'Öffnungszeiten', 'collection', false, true,
          'Reguläre Zeiten und befristete Abweichungen wie Ferien.')
  on conflict (key) do nothing;
  select id into ct_hours from public.content_types where key = 'opening_hours';

  insert into public.fields (content_type_id, key, type, label, help, required, translatable, position)
  select ct_hours, v.key, v.type::public.field_type, v.label, v.help, v.required, v.translatable, v.pos
  from (values
    ('label', 'text',     'Bezeichnung', 'Nur intern, z.B. Regulär oder Sommerferien.', true,  false, 0),
    ('note',  'textarea', 'Hinweis',     'Erscheint unter den Zeiten auf der Website.',  false, true,  1)
  ) as v(key, type, label, help, required, translatable, pos)
  where not exists (select 1 from public.fields f where f.content_type_id = ct_hours and f.key = v.key);

  insert into public.fields (content_type_id, key, type, label, position)
  select ct_hours, 'hours', 'repeater', 'Zeiten', 2
  where not exists (select 1 from public.fields f where f.content_type_id = ct_hours and f.key = 'hours');
  select id into f_parent from public.fields where content_type_id = ct_hours and key = 'hours';

  insert into public.fields (content_type_id, parent_field_id, key, type, label, help, required, config, position)
  select ct_hours, f_parent, v.key, v.type::public.field_type, v.label, v.help, v.required, v.config::jsonb, v.pos
  from (values
    ('day',    'select',  'Tag',           '',                        true,
      '{"options":["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"]}', 0),
    ('from',   'text',    'Von',           'Zum Beispiel 09:00.',     false, '{}', 1),
    ('to',     'text',    'Bis',           'Zum Beispiel 18:30.',     false, '{}', 2),
    ('closed', 'boolean', 'Geschlossen',   'Überschreibt die Zeiten.', false, '{}', 3)
  ) as v(key, type, label, help, required, config, pos)
  where not exists (
    select 1 from public.fields f where f.content_type_id = ct_hours and f.parent_field_id = f_parent and f.key = v.key
  );


  ------------------------------------------------------------------------------
  -- Team
  ------------------------------------------------------------------------------
  insert into public.content_types (key, name, name_plural, kind, sortable, description)
  values ('team', 'Person', 'Team', 'collection', true, 'Mitarbeitende mit Foto und Funktion.')
  on conflict (key) do nothing;
  select id into ct_team from public.content_types where key = 'team';

  -- Der Name einer Person ist in allen Sprachen derselbe und deshalb nicht
  -- übersetzbar. Die Funktionsbezeichnung dagegen schon.
  insert into public.fields (content_type_id, key, type, label, help, required, translatable, position)
  select ct_team, v.key, v.type::public.field_type, v.label, v.help, v.required, v.translatable, v.pos
  from (values
    ('name',  'text',     'Name',     '',                                 true,  false, 0),
    ('role',  'text',     'Funktion', 'Zum Beispiel Küchenchefin.',       false, true,  1),
    ('photo', 'media',    'Foto',     '',                                 false, false, 2),
    ('bio',   'textarea', 'Kurztext', '',                                 false, true,  3)
  ) as v(key, type, label, help, required, translatable, pos)
  where not exists (select 1 from public.fields f where f.content_type_id = ct_team and f.key = v.key);


  ------------------------------------------------------------------------------
  -- Leistungen · für Handwerk, Coiffeur, Praxis
  ------------------------------------------------------------------------------
  insert into public.content_types (key, name, name_plural, kind, sortable, description)
  values ('services', 'Leistung', 'Leistungen', 'collection', true, 'Angebot mit Beschreibung und Preis.')
  on conflict (key) do nothing;
  select id into ct_service from public.content_types where key = 'services';

  insert into public.fields (content_type_id, key, type, label, help, required, translatable, config, position)
  select ct_service, v.key, v.type::public.field_type, v.label, v.help, v.required, v.translatable, v.config::jsonb, v.pos
  from (values
    ('title',       'text',     'Bezeichnung', '',                         true,  true,  '{}', 0),
    ('description', 'textarea', 'Beschreibung','',                         false, true,  '{}', 1),
    ('price_from',  'price',    'Preis ab',    'Leer lassen für auf Anfrage.', false, false, '{"currency":"CHF"}', 2),
    ('image',       'media',    'Bild',        '',                         false, false, '{}', 3)
  ) as v(key, type, label, help, required, translatable, config, pos)
  where not exists (select 1 from public.fields f where f.content_type_id = ct_service and f.key = v.key);


  ------------------------------------------------------------------------------
  -- Branchen-Sets für das Onboarding
  ------------------------------------------------------------------------------
  insert into public.blueprints (key, name, description) values
    ('restaurant', 'Restaurant', 'Speisekarte, Öffnungszeiten, Team, Neuigkeiten.'),
    ('handwerk',   'Handwerk',   'Leistungen, Team, Neuigkeiten.'),
    ('coiffeur',   'Coiffeur',   'Leistungen, Öffnungszeiten, Team, Neuigkeiten.'),
    ('praxis',     'Praxis',     'Leistungen, Öffnungszeiten, Team, Neuigkeiten.')
  on conflict (key) do nothing;

  insert into public.blueprint_content_types (blueprint_key, content_type_id, position) values
    ('restaurant', ct_menu,    0), ('restaurant', ct_hours,   1),
    ('restaurant', ct_team,    2), ('restaurant', ct_news,    3),
    ('handwerk',   ct_service, 0), ('handwerk',   ct_team,    1), ('handwerk', ct_news, 2),
    ('coiffeur',   ct_service, 0), ('coiffeur',   ct_hours,   1),
    ('coiffeur',   ct_team,    2), ('coiffeur',   ct_news,    3),
    ('praxis',     ct_service, 0), ('praxis',     ct_hours,   1),
    ('praxis',     ct_team,    2), ('praxis',     ct_news,    3)
  on conflict do nothing;


  ------------------------------------------------------------------------------
  -- Testmandant bekommt alles, Demo-Restaurant das Restaurant-Set
  ------------------------------------------------------------------------------
  insert into public.tenant_content_types (tenant_id, content_type_id, position)
  select t.id, ct.id, row_number() over (order by ct.key)
  from public.tenants t cross join public.content_types ct
  where t.slug = 'vinamo-test'
  on conflict do nothing;

  insert into public.tenant_content_types (tenant_id, content_type_id, position)
  select t.id, bct.content_type_id, bct.position
  from public.tenants t
  join public.blueprint_content_types bct on bct.blueprint_key = 'restaurant'
  where t.slug = 'demo-restaurant'
  on conflict do nothing;

end $$;


-- -----------------------------------------------------------------------------
-- Baukasten anwenden · beim Onboarding eines neuen Kunden
-- -----------------------------------------------------------------------------
create or replace function public.apply_blueprint(p_tenant_id uuid, p_blueprint_key text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if not public.is_platform_admin() then
    raise exception 'Nur Vinamo darf Inhaltstypen freischalten' using errcode = '42501';
  end if;

  insert into public.tenant_content_types (tenant_id, content_type_id, position)
  select p_tenant_id, bct.content_type_id, bct.position
  from public.blueprint_content_types bct
  where bct.blueprint_key = p_blueprint_key
  on conflict (tenant_id, content_type_id) do nothing;

  get diagnostics v_count = row_count;

  perform public.log_audit(p_tenant_id, 'tenant.blueprint_applied', 'tenant', p_tenant_id::text,
    jsonb_build_object('blueprint', p_blueprint_key, 'content_types', v_count));

  return v_count;
end;
$$;

revoke execute on function public.apply_blueprint(uuid, text) from public, anon;
grant execute on function public.apply_blueprint(uuid, text) to authenticated;
