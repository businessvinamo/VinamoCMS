-- =============================================================================
-- Vinamo CMS · 0012 Medien und Webhooks
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Mediathek
--
-- Einträge referenzieren ausschliesslich die media_id, niemals einen Dateipfad.
-- Wird ein Bild ersetzt oder in andere Grössen gerechnet, ändert sich nichts an
-- den Inhalten.
-- -----------------------------------------------------------------------------
create table public.media (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  path           text not null,
  original_name  text not null default '',
  mime           text not null,
  bytes          bigint not null,
  width          int,
  height         int,
  checksum       text not null,

  -- Fokuspunkt als Vorgabe für jeden Zuschnitt. 0.5/0.5 ist die Bildmitte.
  -- Ein abweichender Zuschnitt pro Verwendung liegt im Feldwert des Eintrags,
  -- weil dasselbe Foto in 16:9 und 1:1 verschieden beschnitten werden muss.
  focal_x        numeric(4,3) not null default 0.5,
  focal_y        numeric(4,3) not null default 0.5,

  -- [{ "w": 800, "path": "...", "bytes": 12345 }] -- daraus baut die API das srcset.
  variants       jsonb not null default '[]'::jsonb,

  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id) on delete set null,

  constraint media_focal_range check (
    focal_x between 0 and 1 and focal_y between 0 and 1
  ),
  constraint media_bytes_positive check (bytes > 0),
  constraint media_variants_is_array check (jsonb_typeof(variants) = 'array')
);

-- Dasselbe Bild soll an mehreren Stellen verwendbar sein, ohne Duplikat. Der
-- Upload prüft die Prüfsumme und liefert bei einem Treffer den bestehenden
-- Datensatz zurück, statt eine zweite Kopie anzulegen.
create unique index media_tenant_checksum on public.media (tenant_id, checksum);
create index media_tenant_created_idx on public.media (tenant_id, created_at desc);

create table public.media_translations (
  media_id   uuid not null references public.media(id) on delete cascade,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  locale     text not null,
  alt        text not null default '',
  primary key (media_id, locale),
  constraint media_translations_locale check (locale in ('de', 'fr', 'it', 'en'))
);

comment on table public.media_translations is
  'Alt-Texte sind übersetzbar -- sie sind Inhalt, kein technisches Attribut.';


-- -----------------------------------------------------------------------------
-- Webhooks
--
-- Standard ist statische Auslieferung: Beim Veröffentlichen wird die Kundenseite
-- neu gebaut. Damit bleiben alle Kundenseiten online, auch wenn dieses Backend
-- gerade nicht erreichbar ist.
-- -----------------------------------------------------------------------------
create table public.webhooks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null default '',
  url         text not null,
  secret      text not null,
  events      text[] not null default array['entry.published'],
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),

  -- Kein http, keine internen Adressen. Ein Webhook auf 127.0.0.1 oder
  -- 169.254.169.254 wäre ein serverseitiger Anfrage-Fälschungs-Vektor: Der Kunde
  -- trägt die URL ein, aber unser Server ruft sie auf.
  constraint webhooks_url_https check (url ~ '^https://'),
  constraint webhooks_url_not_internal check (
    url !~* '^https://(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[)'
  )
);

create index webhooks_tenant_idx on public.webhooks (tenant_id) where is_active;

create table public.webhook_deliveries (
  id              bigint generated always as identity primary key,
  webhook_id      uuid not null references public.webhooks(id) on delete cascade,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  event           text not null,
  payload         jsonb not null default '{}'::jsonb,
  attempt         int not null default 0,
  status_code     int,
  error           text,
  created_at      timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  delivered_at    timestamptz
);

-- Trägt die Abfrage des Zustellers: was ist fällig?
create index webhook_deliveries_pending_idx
  on public.webhook_deliveries (next_attempt_at)
  where delivered_at is null;
create index webhook_deliveries_tenant_idx
  on public.webhook_deliveries (tenant_id, created_at desc);

comment on table public.webhook_deliveries is
  'Sichtbares Fehlerprotokoll. Ohne das merkt niemand, dass die Kundenseite seit
   drei Tagen nicht mehr neu gebaut wird -- der Kunde veröffentlicht, es passiert
   nichts, und er ruft an.';


-- -----------------------------------------------------------------------------
-- Mandantentrennung
-- -----------------------------------------------------------------------------
alter table public.media               enable row level security;
alter table public.media_translations  enable row level security;
alter table public.webhooks            enable row level security;
alter table public.webhook_deliveries  enable row level security;

revoke all on public.media, public.media_translations, public.webhooks,
              public.webhook_deliveries
  from anon;

create policy media_select on public.media
  for select to authenticated using (public.is_tenant_member(tenant_id));
create policy media_write on public.media
  for all to authenticated
  using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));

create policy media_translations_select on public.media_translations
  for select to authenticated using (public.is_tenant_member(tenant_id));
create policy media_translations_write on public.media_translations
  for all to authenticated
  using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));

-- Webhooks sind Betriebskonfiguration, nicht Inhalt. Der Kunde darf sehen, ob
-- seine Seite gebaut wurde, aber nicht, wohin gerufen wird -- und das Geheimnis
-- schon gar nicht. Die Oberfläche wählt deshalb nie webhooks.secret aus.
create policy webhooks_select on public.webhooks
  for select to authenticated using (public.is_tenant_owner(tenant_id));
create policy webhooks_write on public.webhooks
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy webhook_deliveries_select on public.webhook_deliveries
  for select to authenticated using (public.is_tenant_member(tenant_id));


-- -----------------------------------------------------------------------------
-- Speicher
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', true,
  15728640,  -- 15 MB: Kunden laden 8-MB-Handyfotos hoch, der Server rechnet sie klein
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'application/pdf']
)
on conflict (id) do nothing;

-- Gelesen wird öffentlich (es sind Bilder auf Kundenwebsites). Geschrieben wird
-- ausschliesslich serverseitig mit dem Service-Schlüssel, damit Grösse, Typ und
-- Umrechnung nicht umgangen werden können.
create policy "media oeffentlich lesbar"
  on storage.objects for select
  to public
  using (bucket_id = 'media');
