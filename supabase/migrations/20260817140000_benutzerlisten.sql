-- =============================================================================
-- Vinamo CMS · 0018 Benutzerlisten ohne Service-Schlüssel
--
-- Die Zugangsseiten lasen bisher ALLE Auth-Benutzer mit dem Service-Schlüssel
-- und filterten danach in TypeScript. Zwei Probleme damit:
--
--   * Der Service-Schlüssel umgeht Row Level Security vollständig. Die Grenze
--     lag damit im Anwendungscode statt in der Datenbank -- genau das, was
--     dieses Projekt sonst überall vermeidet.
--   * Bei tausend Konten holt man tausend, um zwei anzuzeigen.
--
-- Stattdessen zwei SECURITY-DEFINER-Funktionen, die ihre Berechtigung selbst
-- prüfen und nur zurückgeben, was der Aufrufer sehen darf.
-- =============================================================================

create or replace function public.tenant_member_accounts(p_tenant_id uuid)
returns table (
  user_id uuid,
  email text,
  can_manage_users boolean,
  allowed_content_types uuid[],
  muss_passwort_aendern boolean,
  last_sign_in_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.user_id,
    u.email::text,
    m.can_manage_users,
    m.allowed_content_types,
    coalesce((u.raw_app_meta_data ->> 'muss_passwort_aendern')::boolean, false),
    u.last_sign_in_at,
    m.created_at
  from public.tenant_members m
  join auth.users u on u.id = m.user_id
  where m.tenant_id = p_tenant_id
    -- Ohne diese Zeile wäre die Funktion ein Weg, die Mitglieder jedes
    -- beliebigen Mandanten aufzulisten -- SECURITY DEFINER fragt RLS nicht.
    and public.is_tenant_member(p_tenant_id)
  order by m.created_at;
$$;

revoke execute on function public.tenant_member_accounts(uuid) from public, anon;
grant execute on function public.tenant_member_accounts(uuid) to authenticated;


-- Alle Konten über alle Mandanten. Ausschliesslich für die Rolle admin.
create or replace function public.all_user_accounts()
returns table (
  user_id uuid,
  email text,
  is_platform_admin boolean,
  muss_passwort_aendern boolean,
  last_sign_in_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    u.email::text,
    exists (select 1 from public.platform_admins pa where pa.user_id = u.id),
    coalesce((u.raw_app_meta_data ->> 'muss_passwort_aendern')::boolean, false),
    u.last_sign_in_at,
    u.created_at
  from auth.users u
  where public.is_platform_admin()
  order by u.created_at;
$$;

revoke execute on function public.all_user_accounts() from public, anon;
grant execute on function public.all_user_accounts() to authenticated;
