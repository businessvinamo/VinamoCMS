-- =============================================================================
-- Vinamo CMS · 0019 Wiederherstellen prüft dasselbe Recht wie Veröffentlichen
--
-- Gefunden beim Sicherheitsdurchgang mit echten Testkonten.
--
-- BEFUND 1 · restore_entry_version prüfte nur die Mitgliedschaft
-- --------------------------------------------------------------
-- Migration 0017 hat publish_entry auf can_edit_content_type umgestellt, seine
-- Schwesterfunktion aber übersehen. restore_entry_version fragte weiter nur
-- is_tenant_member(). Damit konnte eine Aushilfe, die ausschliesslich News
-- pflegen darf, den Entwurf eines Speisekarten-Eintrags mit einer alten Version
-- überschreiben -- veröffentlichen konnte sie ihn nicht, aber die Arbeit des
-- Wirts war weg.
--
-- Nachgewiesen mit Impersonation gegen die Produktionsdatenbank:
--
--   Aushilfe stellt Speisekarten-Version wieder her → DURCHGELASSEN
--   Aushilfe veröffentlicht Speisekarte             → abgewiesen
--   Wert des Entwurfs danach                        → "ÜBERSCHRIEBEN"
--
-- Die Lehre: Wer eine Prüfung verschärft, muss jede Funktion mitnehmen, die auf
-- dieselben Zeilen schreibt. Schreibende Wege auf entries sind publish_entry und
-- restore_entry_version -- beide gehören an dieselbe Prüfung.
--
-- BEFUND 2 · PUBLIC und anon durften beide Funktionen ausführen
-- -------------------------------------------------------------
-- Migration 0006 hatte den Standard-Grant an PUBLIC entzogen. Durch spätere
-- create-or-replace-Läufe stand er wieder da, und der Supabase-Linter meldete
-- beide Funktionen als „von anon aufrufbar".
--
-- Ausnutzbar war das nicht: Beide prüfen intern, und für anon ist auth.uid()
-- NULL, also schlägt jede Prüfung fehl -- geprüft, anon wird abgewiesen. Ein
-- offener Grant auf eine SECURITY-DEFINER-Funktion ist trotzdem kein Zustand,
-- den man stehen lässt: Er macht die innere Prüfung zur einzigen Grenze.
-- =============================================================================

create or replace function public.restore_entry_version(p_version_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_version public.entry_versions; v_entry public.entries; v_locale text; v_data jsonb;
begin
  select * into v_version from public.entry_versions where id = p_version_id;
  if not found then
    raise exception 'Version % existiert nicht', p_version_id using errcode = 'P0002';
  end if;

  select * into v_entry from public.entries where id = v_version.entry_id;
  if not found then
    raise exception 'Eintrag zur Version % existiert nicht', p_version_id using errcode = 'P0002';
  end if;

  -- Dieselbe Prüfung wie in publish_entry. Wiederherstellen ist ein Schreibzugriff
  -- auf den Entwurf und darf nicht schwächer geschützt sein als Veröffentlichen.
  if not public.can_edit_content_type(v_entry.tenant_id, v_entry.content_type_id) then
    raise exception 'Kein Zugriff auf diesen Eintrag' using errcode = '42501';
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

  perform public.log_audit(v_version.tenant_id, 'entry.restored', 'entry', v_version.entry_id::text,
    jsonb_build_object('version_no', v_version.version_no));
end; $$;


-- -----------------------------------------------------------------------------
-- Grants aufräumen
--
-- Triggerfunktionen brauchen überhaupt keinen Grant: Postgres ruft sie mit den
-- Rechten des Tabelleneigentümers auf. Als RPC erreichbar sind sie nur Ballast
-- in der öffentlichen Schnittstelle.
-- -----------------------------------------------------------------------------
revoke execute on function public.publish_entry(uuid, text)      from public, anon;
revoke execute on function public.restore_entry_version(uuid)    from public, anon;
grant  execute on function public.publish_entry(uuid, text)      to authenticated;
grant  execute on function public.restore_entry_version(uuid)    to authenticated;

revoke execute on function public.assert_content_type_enabled()          from public, anon, authenticated;
revoke execute on function public.assert_single_entry_for_single_type()  from public, anon, authenticated;
revoke execute on function public.set_translation_tenant()               from public, anon, authenticated;
