-- =============================================================================
-- Vinamo CMS · 0014 Wiederholgruppen richtig zusammenführen
--
-- Fehler, gefunden beim ersten Test mit echten Speisekartendaten:
--
-- public_content aus 0011 hat Basiswerte und Übersetzung mit jsonb_deep_merge
-- verschmolzen. Für einfache Felder stimmt das. Für Wiederholgruppen nicht:
--
--   Basis:        "dishes": [ {_id, price, allergens}, ... ]        -- ein ARRAY
--   Übersetzung:  "dishes": { "<zeilen_id>": {dish}, ... }          -- ein OBJEKT
--
-- jsonb_deep_merge verschmilzt nur Objekt mit Objekt; bei unterschiedlichen
-- Typen gewinnt die rechte Seite. Also ersetzte das Übersetzungsobjekt das
-- Array -- und mit ihm verschwanden Preise, Allergene und die Reihenfolge.
-- Die Speisekarte hätte Gerichtsnamen ohne Preise ausgeliefert.
--
-- Richtig ist eine zeilenweise Zusammenführung: Die Reihenfolge kommt aus dem
-- Array der Basis, und jede Zeile holt sich ihre Übersetzung über ihre stabile
-- _id -- erst aus der Fallback-Sprache, dann aus der Zielsprache.
-- =============================================================================

create or replace function public.merge_entry_values(
  p_base     jsonb,   -- nicht übersetzbare Werte, inkl. Wiederholgruppen-Zeilen
  p_fallback jsonb,   -- Übersetzung in der Hauptsprache des Mandanten
  p_override jsonb    -- Übersetzung in der gewünschten Sprache
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  k         text;
  v         jsonb;
  zeile     jsonb;
  zeilen    jsonb;
  zeilen_id text;
  ergebnis  jsonb := '{}'::jsonb;
  fallback  jsonb := coalesce(p_fallback, '{}'::jsonb);
  override  jsonb := public.jsonb_strip_blank(coalesce(p_override, '{}'::jsonb));
begin
  -- 1. Alles aus der Basis. Wiederholgruppen zeilenweise anreichern.
  for k, v in select * from jsonb_each(coalesce(p_base, '{}'::jsonb)) loop
    if jsonb_typeof(v) = 'array' then
      zeilen := '[]'::jsonb;

      for zeile in select * from jsonb_array_elements(v) loop
        zeilen_id := zeile ->> '_id';

        if zeilen_id is not null then
          -- Verbindung ausschliesslich über die Zeilen-ID. Niemals über die
          -- Position im Array: Fügt die Wirtin auf Deutsch eine Zeile in der
          -- Mitte ein, sässen ab dort alle französischen Bezeichnungen an den
          -- falschen Preisen -- still, und sofort öffentlich sichtbar.
          zeile := public.jsonb_deep_merge(
            zeile,
            coalesce(fallback #> array[k, zeilen_id], '{}'::jsonb)
          );
          zeile := public.jsonb_deep_merge(
            zeile,
            coalesce(override #> array[k, zeilen_id], '{}'::jsonb)
          );
        end if;

        zeilen := zeilen || jsonb_build_array(zeile);
      end loop;

      ergebnis := ergebnis || jsonb_build_object(k, zeilen);
    else
      ergebnis := ergebnis || jsonb_build_object(k, v);
    end if;
  end loop;

  -- 2. Übersetzte Felder, die es in der Basis nicht gibt (Titel, Text, ...).
  --    Wiederholgruppen sind hier bereits erledigt und werden übersprungen --
  --    sonst landete das Zeilen-ID-Objekt zusätzlich in der Ausgabe.
  for k, v in select * from jsonb_each(fallback) loop
    if not (ergebnis ? k) then
      ergebnis := ergebnis || jsonb_build_object(k, v);
    end if;
  end loop;

  for k, v in select * from jsonb_each(override) loop
    if jsonb_typeof(coalesce(p_base -> k, 'null'::jsonb)) <> 'array' then
      ergebnis := ergebnis || jsonb_build_object(k, v);
    end if;
  end loop;

  return ergebnis;
end;
$$;

revoke execute on function public.merge_entry_values(jsonb, jsonb, jsonb) from public, anon;


-- public_content neu, jetzt mit der zeilenweisen Zusammenführung.
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
  if not found then return jsonb_build_object('error', 'unbekannter Mandant'); end if;

  select * into v_type from public.content_types where key = p_type_key;
  if not found then return jsonb_build_object('error', 'unbekannter Inhaltstyp'); end if;

  if not exists (select 1 from public.tenant_content_types tct
                 where tct.tenant_id = v_tenant.id and tct.content_type_id = v_type.id) then
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
                r.snapshot #>> array['translations', p_locale,   'slug'],
                r.snapshot #>> array['translations', v_fallback, 'slug']),
      'values', public.merge_entry_values(
                  r.snapshot -> 'field_values',
                  r.snapshot #> array['translations', v_fallback, 'field_values'],
                  r.snapshot #> array['translations', p_locale,   'field_values'])
    ) order by r.sort_position), '[]'::jsonb)
  into v_items
  from public.resolve_live_entries(v_tenant.id, v_type.id, p_at) r;

  v_next := public.next_content_change(v_tenant.id, v_type.id, p_at);

  return jsonb_build_object(
    'tenant',          v_tenant.slug,
    'type',            v_type.key,
    'kind',            v_type.kind,
    'locale',          p_locale,
    'fallback_locale', v_fallback,
    'generated_at',    p_at,
    'next_change_at',  v_next,
    'items',           v_items
  );
end;
$$;

revoke execute on function public.public_content(text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.public_content(text, text, text, timestamptz) to service_role;
