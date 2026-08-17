-- =============================================================================
-- Vinamo CMS · 0011 Veröffentlichen und Auflösen
--
-- Die wichtigste Datei im Projekt. Hier steht an genau einer Stelle, was zu
-- einem gegebenen Zeitpunkt gilt. Statischer Build, öffentliche Lese-API und
-- Vorschau rufen alle dieselbe Funktion mit unterschiedlichem Zeitpunkt auf.
--
-- Zweimal implementiert -- einmal für den Build, einmal für die API -- würden die
-- beiden auseinanderdriften, und der Fehler zeigt sich als "auf der Website
-- steht etwas anderes als in der Vorschau".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Übersetzungen zusammenführen
--
-- Tiefe Verschmelzung, weil Unterfelder einer Wiederholgruppe als
-- {feld: {zeilen_id: {unterfeld: wert}}} liegen. Eine flache Verschmelzung
-- würde beim Übersetzen einer einzigen Zeile alle übrigen Zeilen der Sprache
-- verlieren.
-- -----------------------------------------------------------------------------
create or replace function public.jsonb_strip_blank(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  out jsonb := '{}'::jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return p;
  end if;

  for k, v in select * from jsonb_each(p) loop
    if v is null or v = 'null'::jsonb then
      continue;
    elsif jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '' then
      -- Ein leer gelassenes Übersetzungsfeld gilt als "nicht übersetzt" und darf
      -- die Fallback-Sprache nicht überschreiben. Die Website bleibt nie leer.
      continue;
    elsif jsonb_typeof(v) = 'object' then
      v := public.jsonb_strip_blank(v);
      if v = '{}'::jsonb then continue; end if;
    end if;
    out := out || jsonb_build_object(k, v);
  end loop;

  return out;
end;
$$;

create or replace function public.jsonb_deep_merge(base jsonb, override jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  out jsonb;
begin
  if base is null then return override; end if;
  if override is null then return base; end if;
  if jsonb_typeof(base) <> 'object' or jsonb_typeof(override) <> 'object' then
    return override;
  end if;

  out := base;
  for k in select jsonb_object_keys(override) loop
    if base ? k then
      out := out || jsonb_build_object(k, public.jsonb_deep_merge(base -> k, override -> k));
    else
      out := out || jsonb_build_object(k, override -> k);
    end if;
  end loop;

  return out;
end;
$$;


-- -----------------------------------------------------------------------------
-- Veröffentlichen
--
-- Schreibt den vollständigen Stand als unveränderlichen Schnappschuss fort und
-- lässt entries.published_version_id darauf zeigen. Der Entwurf bleibt
-- unberührt: Der Kunde arbeitet weiter, ohne dass die Website sich ändert.
-- -----------------------------------------------------------------------------
create or replace function public.publish_entry(p_entry_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry      public.entries;
  v_version_no int;
  v_version_id uuid;
  v_snapshot   jsonb;
  v_trans      jsonb;
begin
  select * into v_entry from public.entries where id = p_entry_id;
  if not found then
    raise exception 'Eintrag % existiert nicht', p_entry_id using errcode = 'P0002';
  end if;
  if not public.is_tenant_member(v_entry.tenant_id) then
    raise exception 'Kein Zugriff auf diesen Eintrag' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(
           t.locale,
           jsonb_build_object('field_values', t.field_values, 'slug', t.slug)
         ), '{}'::jsonb)
  into v_trans
  from public.entry_translations t
  where t.entry_id = p_entry_id;

  v_snapshot := jsonb_build_object(
    'entry_id',     v_entry.id,
    'field_values', v_entry.field_values,
    'translations', v_trans,
    'position',     v_entry.position,
    'slot',         v_entry.slot,
    'priority',     v_entry.priority,
    'publish_at',   v_entry.publish_at,
    'valid_from',   v_entry.valid_from,
    'valid_until',  v_entry.valid_until
  );

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.entry_versions where entry_id = p_entry_id;

  insert into public.entry_versions (entry_id, tenant_id, version_no, snapshot, note, published_by)
  values (p_entry_id, v_entry.tenant_id, v_version_no, v_snapshot, p_note, (select auth.uid()))
  returning id into v_version_id;

  update public.entries
  set published_version_id = v_version_id,
      status = case when status = 'archived' then status else 'published' end,
      updated_by = (select auth.uid())
  where id = p_entry_id;

  -- Slug-Historie fortschreiben: alte Slugs bleiben als Weiterleitungsziel
  -- stehen, damit eine Umbenennung keinen 404 und keinen toten Google-Eintrag
  -- hinterlässt.
  update public.entry_slugs
  set is_current = false
  where entry_id = p_entry_id and is_current;

  insert into public.entry_slugs (tenant_id, content_type_id, entry_id, locale, slug, is_current)
  select v_entry.tenant_id, v_entry.content_type_id, p_entry_id, t.locale, t.slug, true
  from public.entry_translations t
  where t.entry_id = p_entry_id and t.slug is not null
  on conflict do nothing;

  perform public.log_audit(
    v_entry.tenant_id, 'entry.published', 'entry', p_entry_id::text,
    jsonb_build_object('version_no', v_version_no)
  );

  return v_version_id;
end;
$$;

grant execute on function public.publish_entry(uuid, text) to authenticated;


-- Letzte Version wiederherstellen: schreibt den Schnappschuss zurück in den
-- Entwurf. Für den Kunden ist das der "Rückgängig"-Knopf.
create or replace function public.restore_entry_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.entry_versions;
  v_locale  text;
  v_data    jsonb;
begin
  select * into v_version from public.entry_versions where id = p_version_id;
  if not found then
    raise exception 'Version % existiert nicht', p_version_id using errcode = 'P0002';
  end if;
  if not public.is_tenant_member(v_version.tenant_id) then
    raise exception 'Kein Zugriff auf diese Version' using errcode = '42501';
  end if;

  update public.entries
  set field_values = v_version.snapshot -> 'field_values',
      position     = coalesce((v_version.snapshot ->> 'position')::int, 0),
      slot         = v_version.snapshot ->> 'slot',
      priority     = coalesce((v_version.snapshot ->> 'priority')::int, 0),
      publish_at   = (v_version.snapshot ->> 'publish_at')::timestamptz,
      valid_from   = (v_version.snapshot ->> 'valid_from')::timestamptz,
      valid_until  = (v_version.snapshot ->> 'valid_until')::timestamptz,
      updated_by   = (select auth.uid())
  where id = v_version.entry_id;

  for v_locale, v_data in select * from jsonb_each(v_version.snapshot -> 'translations') loop
    insert into public.entry_translations (entry_id, locale, field_values, slug)
    values (v_version.entry_id, v_locale, v_data -> 'field_values', v_data ->> 'slug')
    on conflict (entry_id, locale) do update
      set field_values = excluded.field_values, slug = excluded.slug;
  end loop;

  perform public.log_audit(
    v_version.tenant_id, 'entry.restored', 'entry', v_version.entry_id::text,
    jsonb_build_object('version_no', v_version.version_no)
  );
end;
$$;

grant execute on function public.restore_entry_version(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Auflösen · was gilt zum Zeitpunkt p_at?
--
-- Terminierung ist bewusst kein gespeicherter Status. Ein Job, der Einträge von
-- "geplant" auf "veröffentlicht" umschaltet, kann einen Lauf verpassen -- dann
-- steht die Datenbank falsch da. Hier wird zum Abrufzeitpunkt gerechnet.
--
-- Plätze: Einträge ohne Platz stehen für sich. Innerhalb eines Platzes gewinnt
-- der gültige Eintrag mit der höchsten Priorität; bei Gleichstand der mit dem
-- späteren valid_from. Ein Eintrag ganz ohne Gültigkeitszeitraum ist der
-- Standard und greift, wenn sonst nichts gilt -- damit ist "Saisonkarte schlägt
-- Regelkarte" dieselbe Mechanik wie "Ferienöffnungszeiten schlagen reguläre".
-- -----------------------------------------------------------------------------
create or replace function public.resolve_live_entries(
  p_tenant_id       uuid,
  p_content_type_id uuid,
  p_at              timestamptz
)
-- Achtung: die Rueckgabespalte heisst sort_position, nicht position --
-- "position" ist in einer RETURNS-TABLE-Liste ein reserviertes Wort.
returns table (entry_id uuid, snapshot jsonb, sort_position int, slot text)
language sql
stable
security definer
set search_path = ''
as $$
  with live as (
    select
      e.id, v.snapshot, e.position, e.slot, e.priority, e.valid_from, e.created_at
    from public.entries e
    join public.entry_versions v on v.id = e.published_version_id
    where e.tenant_id = p_tenant_id
      and e.content_type_id = p_content_type_id
      and e.status = 'published'
      and (e.publish_at  is null or e.publish_at  <= p_at)
      and (e.valid_from  is null or e.valid_from  <= p_at)
      and (e.valid_until is null or e.valid_until >  p_at)
  ),
  ranked as (
    select
      live.*,
      case
        when live.slot is null then 1
        else row_number() over (
          partition by live.slot
          order by live.priority desc, live.valid_from desc nulls last, live.created_at desc
        )
      end as rang
    from live
  )
  select ranked.id, ranked.snapshot, ranked.position, ranked.slot
  from ranked
  where ranked.rang = 1
  order by ranked.position, ranked.created_at;
$$;


-- Wann ändert sich der Inhalt das nächste Mal?
--
-- Ohne diese Antwort widersprechen Caching und Terminierung einander: Eine
-- Antwort mit einer Stunde Cache-Dauer würde die Mittagskarte, die um 11:00
-- gültig wird, irgendwann zwischen 11:00 und 12:00 zeigen -- je nachdem, wann
-- der Cache zufällig gefüllt wurde. Die Lese-API begrenzt ihre Cache-Dauer auf
-- genau diesen Zeitpunkt.
create or replace function public.next_content_change(
  p_tenant_id       uuid,
  p_content_type_id uuid,
  p_at              timestamptz
)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select min(grenze)
  from (
    select e.publish_at  as grenze from public.entries e
      where e.tenant_id = p_tenant_id and e.content_type_id = p_content_type_id
        and e.status = 'published' and e.publish_at  > p_at
    union all
    select e.valid_from from public.entries e
      where e.tenant_id = p_tenant_id and e.content_type_id = p_content_type_id
        and e.status = 'published' and e.valid_from  > p_at
    union all
    select e.valid_until from public.entries e
      where e.tenant_id = p_tenant_id and e.content_type_id = p_content_type_id
        and e.status = 'published' and e.valid_until > p_at
  ) grenzen;
$$;


-- -----------------------------------------------------------------------------
-- Die öffentliche Antwort
--
-- Vollständige Nutzlast für einen Mandanten, einen Inhaltstyp, eine Sprache und
-- einen Zeitpunkt. Übersetzungen sind bereits mit der Fallback-Sprache
-- verschmolzen -- das Frontend bekommt fertige Werte und muss weder Gültigkeit
-- noch Fallback selbst prüfen.
-- -----------------------------------------------------------------------------
create or replace function public.public_content(
  p_tenant_slug text,
  p_type_key    text,
  p_locale      text,
  p_at          timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant   public.tenants;
  v_type     public.content_types;
  v_fallback text;
  v_items    jsonb;
  v_next     timestamptz;
begin
  select * into v_tenant from public.tenants where slug = p_tenant_slug and is_active;
  if not found then
    return jsonb_build_object('error', 'unbekannter Mandant');
  end if;

  select * into v_type from public.content_types where key = p_type_key;
  if not found then
    return jsonb_build_object('error', 'unbekannter Inhaltstyp');
  end if;

  if not exists (
    select 1 from public.tenant_content_types tct
    where tct.tenant_id = v_tenant.id and tct.content_type_id = v_type.id
  ) then
    return jsonb_build_object('error', 'Inhaltstyp fuer diesen Mandanten nicht freigeschaltet');
  end if;

  if not (p_locale = any (v_tenant.locales)) then
    return jsonb_build_object('error', 'Sprache fuer diesen Mandanten nicht aktiv');
  end if;

  v_fallback := v_tenant.default_locale;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',   r.entry_id,
      'slot', r.slot,
      'slug', coalesce(
                r.snapshot #>> array['translations', p_locale, 'slug'],
                r.snapshot #>> array['translations', v_fallback, 'slug']
              ),
      'values', public.jsonb_deep_merge(
        public.jsonb_deep_merge(
          r.snapshot -> 'field_values',
          coalesce(r.snapshot #> array['translations', v_fallback, 'field_values'], '{}'::jsonb)
        ),
        public.jsonb_strip_blank(
          coalesce(r.snapshot #> array['translations', p_locale, 'field_values'], '{}'::jsonb)
        )
      )
    )
    order by r.sort_position
  ), '[]'::jsonb)
  into v_items
  from public.resolve_live_entries(v_tenant.id, v_type.id, p_at) r;

  v_next := public.next_content_change(v_tenant.id, v_type.id, p_at);

  return jsonb_build_object(
    'tenant',           v_tenant.slug,
    'type',             v_type.key,
    'kind',             v_type.kind,
    'locale',           p_locale,
    'fallback_locale',  v_fallback,
    'generated_at',     p_at,
    'next_change_at',   v_next,
    'items',            v_items
  );
end;
$$;

-- Aufgerufen wird sie ausschliesslich von der Serverschicht mit dem
-- Service-Schlüssel. anon bekommt bewusst nichts: die öffentliche API ist eine
-- Route in Next.js, kein direkter PostgREST-Zugriff -- sonst liesse sich an
-- Caching, Rate-Limit und ETag vorbei abfragen.
revoke execute on function public.public_content(text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.resolve_live_entries(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.next_content_change(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.jsonb_deep_merge(jsonb, jsonb) from public, anon;
revoke execute on function public.jsonb_strip_blank(jsonb) from public, anon;
grant execute on function public.public_content(text, text, text, timestamptz) to service_role;
