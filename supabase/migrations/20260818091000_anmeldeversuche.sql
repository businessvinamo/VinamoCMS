-- =============================================================================
-- Vinamo CMS · 0020 Bremse für Anmeldeversuche
--
-- Gemessen beim Sicherheitsdurchgang: zwölf falsche Passwörter hintereinander,
-- zwölfmal dieselbe Antwort, keine Verzögerung, keine Sperre. Ein Adminportal
-- ohne Bremse ist genau so lange sicher, wie die Passwörter der Kunden gut sind
-- -- und ein Startpasswort, das jemand nie gewechselt hat, ist das nicht.
--
-- WARUM IN DER DATENBANK UND NICHT IM ARBEITSSPEICHER
-- ---------------------------------------------------
-- Ein Zähler im Prozess ist nach jedem Neustart leer und existiert pro Instanz
-- einmal. Beides macht ihn zur Zierde: Wer bremsen will, darf nicht bei jedem
-- Deploy von vorn anfangen.
--
-- WARUM NACH E-MAIL UND NICHT NACH IP
-- -----------------------------------
-- Alle Anfragen kommen vom Server, nicht vom Browser des Kunden -- eine Sperre
-- nach IP träfe deshalb alle Kunden gleichzeitig. Der Schlüssel ist die
-- E-Mail-Adresse: Sie trifft genau das Konto, das angegriffen wird.
--
-- Die Kehrseite ist bekannt und in Kauf genommen: Wer die Adresse eines Kunden
-- kennt, kann ihn vorübergehend aussperren. Deshalb 15 Minuten und nicht 24
-- Stunden, und deshalb löscht eine erfolgreiche Anmeldung den Zähler sofort.
-- =============================================================================

create table public.login_attempts (
  id           bigint generated always as identity primary key,
  kennung      text        not null,
  versucht_am  timestamptz not null default now()
);

comment on table public.login_attempts is
  'Fehlgeschlagene Anmeldeversuche, nur zur Bremse. Enthält die E-Mail-Adresse,
   niemals das Passwort. Wird nach 24 Stunden aufgeräumt.';

create index login_attempts_kennung_zeit
  on public.login_attempts (kennung, versucht_am desc);

-- Niemand ausser dem Service-Schlüssel hat hier etwas zu suchen: Die Tabelle
-- verriete sonst, welche Adressen überhaupt existieren und wann sich jemand
-- angemeldet hat.
alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from public, anon, authenticated;

-- Keine tenant_id: Der Versuch findet statt, BEVOR bekannt ist, zu welchem
-- Mandanten die Adresse gehört -- eine Zuordnung gäbe es hier gar nicht.
-- Der Isolationstest prüft Tabellen mit tenant_id; diese hat bewusst keine und
-- ist stattdessen für alle Rollen ausser service_role vollständig gesperrt.


-- -----------------------------------------------------------------------------
-- Zwei Funktionen, nicht eine
--
-- Der erste Entwurf zählte den Versuch und meldete die Sperre in einem Aufruf --
-- nach dem Anmeldeversuch. Das bremst nur die Fehlermeldung: Wer beim
-- fünfzigsten Versuch das richtige Passwort trifft, kommt trotzdem hinein, weil
-- eine erfolgreiche Anmeldung nie geprüft wurde. Die Sperre muss VOR dem
-- Anmeldeversuch stehen, sonst ist sie Zierde.
-- -----------------------------------------------------------------------------

/** Ist diese Adresse gerade gesperrt? Zählt nur, verändert nichts. */
create or replace function public.anmeldung_gesperrt(
  p_kennung text,
  p_grenze  int default 10,
  p_fenster interval default interval '15 minutes'
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select count(*) >= p_grenze
  from public.login_attempts a
  where a.kennung = lower(trim(p_kennung))
    and a.versucht_am > now() - p_fenster;
$$;

/** Einen Fehlversuch verbuchen. Räumt nebenbei Altes weg. */
create or replace function public.anmeldeversuch_verbuchen(p_kennung text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.login_attempts where versucht_am < now() - interval '24 hours';
  insert into public.login_attempts (kennung) values (lower(trim(p_kennung)));
end;
$$;

/** Nach erfolgreicher Anmeldung: Zähler leeren. */
create or replace function public.anmeldeversuche_zuruecksetzen(p_kennung text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.login_attempts where kennung = lower(trim(p_kennung));
$$;

-- Nur der Service-Schlüssel. Wären die Funktionen für anon aufrufbar, könnte
-- jeder fremde Konten aussperren (verbuchen) oder die eigene Bremse lösen
-- (zuruecksetzen) -- und mit gesperrt() liesse sich herausfinden, welche
-- Adressen bei Vinamo überhaupt existieren.
revoke execute on function public.anmeldung_gesperrt(text, int, interval)
  from public, anon, authenticated;
revoke execute on function public.anmeldeversuch_verbuchen(text)
  from public, anon, authenticated;
revoke execute on function public.anmeldeversuche_zuruecksetzen(text)
  from public, anon, authenticated;
grant execute on function public.anmeldung_gesperrt(text, int, interval) to service_role;
grant execute on function public.anmeldeversuch_verbuchen(text)          to service_role;
grant execute on function public.anmeldeversuche_zuruecksetzen(text)     to service_role;
