-- =============================================================================
-- Vinamo CMS · 0004 Einladungen nur für Besitzer sichtbar
--
-- Befund aus dem ersten Isolationslauf: Die Richtlinie aus 0002 liess jedes
-- Mitglied die Einladungsliste seines Mandanten lesen. Ein editor sah damit die
-- E-Mail-Adressen offener Einladungen und das Feld grants_platform_admin -- also
-- wer Plattformrechte erhält. Für die Rolle gibt es dafür keinen Grund.
--
-- Einladungen verwaltet, wer einladen darf: owner und vinamo_admin.
-- =============================================================================

drop policy if exists invitations_select on public.invitations;

create policy invitations_select on public.invitations
  for select to authenticated
  using (
    (tenant_id is not null and public.is_tenant_owner(tenant_id))
    or public.is_platform_admin()
  );
