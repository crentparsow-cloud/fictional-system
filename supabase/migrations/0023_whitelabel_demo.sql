-- 0023 White-label demo (milestone M7).
--
--   F-067 Tenant branding with a contrast check
--   F-068 Locked standards on tenant sites
--   F-069 Tenant catalogue and own prices (config only, no tenant checkout)
--   F-074 Seeded demo publisher and demo tenant
--   F-045 Resettable demo author and publisher logins
--
-- Same rules as 0001 to 0018. Functions are security definer with
-- search_path pinned to ''. Every function an RPC client may call has execute
-- revoked from public first and granted back to the role that needs it.
-- Nothing earlier is edited.
--
-- This migration writes no demo rows. The demo organisation, its tenant and
-- its workbooks are made by public.reset_demo_state() (staff button in
-- /admin/demo) or public.reset_demo_state_job() (the nightly cron). Applying
-- the migration therefore changes nothing a reader can see.
--
-- Error codes:
--   AKW01  tenant brand fails validation or contrast
--   AKW02  tenant column a tenant may not change
--   AKW03  workbook may not be listed on this tenant
--   AKW04  price point is not a workbook point
--   AKW05  demo account refused

-- ===========================================================================
-- 1. Contrast (F-067). WCAG 2.2 relative luminance and contrast ratio.
--
-- Mirrors apps/web/lib/tenant-brand.ts exactly: the same channel formula,
-- the same theme backgrounds and the same text colours. The app checks
-- before save to explain; the trigger below is what enforces.
-- ===========================================================================

create or replace function app.hex_luminance(p_hex text) returns double precision
language plpgsql immutable set search_path = '' as $$
declare
  ch  double precision;
  out double precision := 0;
  w   double precision[] := array[0.2126, 0.7152, 0.0722];
begin
  if p_hex is null or p_hex !~ '^#[0-9a-f]{6}$' then return null; end if;
  for i in 0..2 loop
    ch := ('x' || substr(p_hex, 2 + i * 2, 2))::bit(8)::int / 255.0;
    ch := case when ch <= 0.04045 then ch / 12.92 else power((ch + 0.055) / 1.055, 2.4) end;
    out := out + w[i + 1] * ch;
  end loop;
  return out;
end $$;

create or replace function app.contrast_ratio(p_a text, p_b text) returns double precision
language sql immutable set search_path = '' as $$
  select (greatest(app.hex_luminance(p_a), app.hex_luminance(p_b)) + 0.05)
       / (least(app.hex_luminance(p_a), app.hex_luminance(p_b)) + 0.05)
$$;

-- The better of the two house text colours on a fill: white or house ink.
create or replace function app.best_ink(p_fill text) returns text
language sql immutable set search_path = '' as $$
  select case when app.contrast_ratio(p_fill, '#ffffff') >= app.contrast_ratio(p_fill, '#16222b') then '#ffffff' else '#16222b' end
$$;

-- ===========================================================================
-- 2. Brand validation (F-067, F-068).
--
-- The brand is a closed shape. Any key not listed here is refused, which is
-- how the locked standards hold: there is no setting for custom CSS, scripts,
-- pixels, or hiding Help now, the wellness notice, safety copy or the privacy
-- pages, so none can be stored.
--
--   {
--     "v": 1,
--     "colours": {"light": {"primary": "#rrggbb", "accent": "#rrggbb"},
--                 "dark":  {"primary": "#rrggbb", "accent": "#rrggbb"}},
--     "font": "house" | "serif" | "humanist" | "system",
--     "logo": {"src": "/brand/<slug>/<file>.svg|png|webp" or a Supabase public object URL, "alt": "..."},
--     "favicon": same rule as logo.src,
--     "footer_links": [{"label": "...", "href": "https://..."}]  (up to 5),
--     "legal_links":  [{"label": "...", "href": "https://..."}]  (up to 4, added beside Akana's, never instead),
--     "sender_name": "..."  (up to 60 characters)
--   }
--
-- An empty object is valid: the tenant keeps the house look.
--
-- Contrast, per theme, all at 4.5:1 (WCAG 2.2 AA for body text):
--   primary on the page background (canvas) and on cards (surface), as links;
--   the better house ink on primary, as button text;
--   the better house ink on accent, as text on the header band.
-- Returns one line per problem; an empty array means valid.
-- ===========================================================================

create or replace function app.tenant_brand_problems(p_brand jsonb) returns text[]
language plpgsql immutable set search_path = '' as $$
declare
  out     text[] := '{}';
  k       text;
  th      text;
  c       jsonb;
  v_p     text;
  v_a     text;
  v_r     double precision;
  v_canvas text;
  v_surface text;
  lnk     jsonb;
  v_list  text;
  v_max   int;
  asset   text := '^(/brand/[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9][a-z0-9._-]{0,80}\.(svg|png|webp)|https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/[A-Za-z0-9/._-]{1,200}\.(svg|png|webp))$';
  plain   text := '[<>[:cntrl:]]';
begin
  if p_brand is null or jsonb_typeof(p_brand) <> 'object' then
    return array['brand must be an object'];
  end if;

  for k in select jsonb_object_keys(p_brand) loop
    if k not in ('v','colours','font','logo','favicon','footer_links','legal_links','sender_name') then
      out := out || ('unknown setting: ' || left(k, 40));
    end if;
  end loop;

  if p_brand ? 'v' and p_brand->'v' <> '1'::jsonb then
    out := out || 'v must be 1'::text;
  end if;

  if p_brand ? 'colours' then
    if jsonb_typeof(p_brand->'colours') <> 'object'
       or not (p_brand->'colours' ? 'light' and p_brand->'colours' ? 'dark')
       or exists (select 1 from jsonb_object_keys(p_brand->'colours') x where x not in ('light','dark')) then
      out := out || 'colours needs light and dark, and nothing else'::text;
    else
      foreach th in array array['light','dark'] loop
        c := p_brand->'colours'->th;
        if jsonb_typeof(c) <> 'object'
           or exists (select 1 from jsonb_object_keys(c) x where x not in ('primary','accent'))
           or coalesce(c->>'primary', '') !~ '^#[0-9a-f]{6}$'
           or coalesce(c->>'accent', '') !~ '^#[0-9a-f]{6}$' then
          out := out || (th || ' colours need primary and accent as #rrggbb in lower case');
          continue;
        end if;
        v_p := c->>'primary';
        v_a := c->>'accent';
        v_canvas  := case th when 'light' then '#f7f5f0' else '#0f1719' end;
        v_surface := case th when 'light' then '#ffffff' else '#172226' end;
        v_r := app.contrast_ratio(v_p, v_canvas);
        if v_r < 4.5 then out := out || format('contrast %s primary_canvas %s', th, to_char(floor(v_r * 100) / 100, 'FM990.00')); end if;
        v_r := app.contrast_ratio(v_p, v_surface);
        if v_r < 4.5 then out := out || format('contrast %s primary_surface %s', th, to_char(floor(v_r * 100) / 100, 'FM990.00')); end if;
        v_r := app.contrast_ratio(v_p, app.best_ink(v_p));
        if v_r < 4.5 then out := out || format('contrast %s primary_button %s', th, to_char(floor(v_r * 100) / 100, 'FM990.00')); end if;
        v_r := app.contrast_ratio(v_a, app.best_ink(v_a));
        if v_r < 4.5 then out := out || format('contrast %s accent_band %s', th, to_char(floor(v_r * 100) / 100, 'FM990.00')); end if;
      end loop;
    end if;
  end if;

  if p_brand ? 'font' and coalesce(p_brand->>'font', '') not in ('house','serif','humanist','system') then
    out := out || 'font must be one of house, serif, humanist, system'::text;
  end if;

  if p_brand ? 'logo' then
    if jsonb_typeof(p_brand->'logo') <> 'object'
       or exists (select 1 from jsonb_object_keys(p_brand->'logo') x where x not in ('src','alt'))
       or coalesce(p_brand->'logo'->>'src', '') !~ asset then
      out := out || 'logo src must be a /brand/ path or a Supabase public file (svg, png or webp)'::text;
    end if;
    if jsonb_typeof(p_brand->'logo') = 'object'
       and (char_length(btrim(coalesce(p_brand->'logo'->>'alt', ''))) not between 1 and 120
            or coalesce(p_brand->'logo'->>'alt', '') ~ plain) then
      out := out || 'logo alt text is required, 120 characters or fewer, plain text'::text;
    end if;
  end if;

  if p_brand ? 'favicon' and (jsonb_typeof(p_brand->'favicon') <> 'string' or (p_brand->>'favicon') !~ asset) then
    out := out || 'favicon must be a /brand/ path or a Supabase public file (svg, png or webp)'::text;
  end if;

  foreach v_list in array array['footer_links','legal_links'] loop
    if p_brand ? v_list then
      v_max := case v_list when 'footer_links' then 5 else 4 end;
      if jsonb_typeof(p_brand->v_list) <> 'array' or jsonb_array_length(p_brand->v_list) > v_max then
        out := out || format('%s must be a list of up to %s links', v_list, v_max);
        continue;
      end if;
      for lnk in select x from jsonb_array_elements(p_brand->v_list) x loop
        if jsonb_typeof(lnk) <> 'object'
           or exists (select 1 from jsonb_object_keys(lnk) x where x not in ('label','href'))
           or char_length(btrim(coalesce(lnk->>'label', ''))) not between 1 and 40
           or coalesce(lnk->>'label', '') ~ plain
           or char_length(coalesce(lnk->>'href', '')) > 300
           or coalesce(lnk->>'href', '') !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^[:space:]<>"''\\]*)?$' then
          out := out || format('%s: each link needs a plain label of up to 40 characters and an https address', v_list);
          exit;
        end if;
      end loop;
    end if;
  end loop;

  if p_brand ? 'sender_name' and (
       jsonb_typeof(p_brand->'sender_name') <> 'string'
    or char_length(btrim(p_brand->>'sender_name')) not between 1 and 60
    or (p_brand->>'sender_name') ~ '[<>@"[:cntrl:]]') then
    out := out || 'sender name must be plain text of up to 60 characters, with no @'::text;
  end if;

  return out;
end $$;
-- Pure, reads nothing: left executable so the caller-rights trigger below can use it.

-- The same check for the app, so the admin form can show the database's
-- answer beside its own. Pure: reads nothing.
create or replace function public.check_tenant_brand(p_brand jsonb) returns text[]
language sql immutable security definer set search_path = '' as $$
  select app.tenant_brand_problems(p_brand)
$$;
revoke execute on function public.check_tenant_brand(jsonb) from public, anon;
grant execute on function public.check_tenant_brand(jsonb) to authenticated, service_role;

-- ===========================================================================
-- 3. Tenant writes (F-067, F-068).
--
-- 0001's tenants_update policy lets an organisation's writers update their
-- tenant row. That row also holds the slug, kind, status, seller of record,
-- plan and demo flag, which are Akana's to set. From now on a client that is
-- not a platform owner or editor may change only name and brand. Every
-- caller, staff and server code included, must store a valid brand; a brand
-- change is audited with before and after.
-- ===========================================================================

-- Runs as the caller (not security definer), like the 0002 status guard, so
-- current_user is the client role; server code and security definer
-- functions pass the column check but not the brand check.
create or replace function app.guard_tenant_write() returns trigger
language plpgsql set search_path = '' as $$
declare v_problems text[];
begin
  if tg_op = 'UPDATE' and current_user in ('anon', 'authenticated') and not app.is_platform(array['owner','editor']) then
    if new.id is distinct from old.id or new.slug is distinct from old.slug or new.kind is distinct from old.kind
       or new.org_id is distinct from old.org_id or new.default_locale is distinct from old.default_locale
       or new.default_currency is distinct from old.default_currency or new.seller_of_record is distinct from old.seller_of_record
       or new.stripe_account_id is distinct from old.stripe_account_id or new.plan is distinct from old.plan
       or new.status is distinct from old.status or new.is_demo is distinct from old.is_demo
       or new.created_at is distinct from old.created_at then
      raise exception 'a tenant may change its name and brand only' using errcode = 'AKW02';
    end if;
  end if;

  if tg_op = 'INSERT' or new.name is distinct from old.name then
    if char_length(btrim(coalesce(new.name, ''))) not between 1 and 80 or new.name ~ '[<>[:cntrl:]]' then
      raise exception 'the site name must be plain text of 1 to 80 characters' using errcode = 'AKW01';
    end if;
  end if;

  if tg_op = 'INSERT' or new.brand is distinct from old.brand then
    v_problems := app.tenant_brand_problems(new.brand);
    if cardinality(v_problems) > 0 then
      raise exception 'brand refused: %', array_to_string(v_problems, '; ') using errcode = 'AKW01';
    end if;
    if tg_op = 'UPDATE' then
      perform app.audit('tenant.brand_changed', 'tenant:' || new.id::text, null, new.id, new.org_id,
        jsonb_build_object('brand', old.brand), jsonb_build_object('brand', new.brand));
    end if;
  end if;
  return new;
end $$;
-- Sorts before tenants_touch, so it sees the row as the client sent it.
create trigger tenants_brand_guard before insert or update on public.tenants
  for each row execute function app.guard_tenant_write();

-- What a tenant site needs to draw itself, readable by anyone who knows the
-- id. plan is not returned; only whether "Powered by Akana" shows, which is
-- by plan: shown unless the plan is listed in app_config
-- powered_by_hidden_plans. The list starts empty because plans are not set.
create or replace function public.tenant_site(p_tenant uuid)
returns table (tenant_id uuid, slug text, kind text, name text, brand jsonb, is_demo boolean, status text, powered_by boolean)
language sql stable security definer set search_path = '' as $$
  select t.id, t.slug, t.kind, t.name, t.brand, t.is_demo, t.status,
         not coalesce((select c.value ? t.plan from public.app_config c where c.key = 'powered_by_hidden_plans'), false)
  from public.tenants t
  where t.id = p_tenant
$$;
revoke execute on function public.tenant_site(uuid) from public;
grant execute on function public.tenant_site(uuid) to anon, authenticated, service_role;

insert into public.app_config (key, value) values ('powered_by_hidden_plans', '[]'::jsonb)
on conflict (key) do nothing;

-- ===========================================================================
-- 4. Tenant catalogue and own prices (F-069).
--
-- A white-label tenant picks which workbooks it shows (tenant_listings, 0002)
-- and may set its own point on the price ladder per listing. Prices are
-- config only: there is no tenant checkout yet, and the checkout route still
-- reads workbooks.price_point_id on the marketplace alone.
--
-- What a white-label tenant may list, for every caller:
--   * its own organisation's workbooks;
--   * on a demo tenant, demo workbooks from anyone, and nothing else, so a
--     demo site never shows a real title;
--   * never a demo workbook on a real tenant.
-- The marketplace tenant keeps 0002's behaviour and takes no listing price.
-- Wellbeing titles reach a tenant site only once they are live, which the
-- release gate (0016) allows only after Akana's safety review.
-- ===========================================================================

alter table public.tenant_listings
  add column price_point_id text references public.price_points(id);

create or replace function app.guard_tenant_listing() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t public.tenants%rowtype;
  w public.workbooks%rowtype;
begin
  select * into t from public.tenants where id = new.tenant_id;
  select * into w from public.workbooks where id = new.workbook_id;
  if not found then return new; end if; -- the foreign key answers this

  if new.price_point_id is not null then
    if t.kind = 'marketplace' then
      raise exception 'marketplace prices come from the workbook, not the listing' using errcode = 'AKW04';
    end if;
    if not exists (select 1 from public.price_points p where p.id = new.price_point_id and p.kind = 'workbook') then
      raise exception 'a listing price must be a workbook point on the ladder' using errcode = 'AKW04';
    end if;
  end if;

  if t.kind = 'white_label' and (tg_op = 'INSERT' or new.workbook_id is distinct from old.workbook_id or new.tenant_id is distinct from old.tenant_id) then
    if t.is_demo and not w.is_demo then
      raise exception 'a demo site shows demo workbooks only; % is not a demo', w.code using errcode = 'AKW03';
    end if;
    if not t.is_demo and w.is_demo then
      raise exception 'a demo workbook cannot be listed on a real tenant (%)', w.code using errcode = 'AKW03';
    end if;
    if not t.is_demo and (t.org_id is null or w.org_id <> t.org_id) then
      raise exception 'a tenant lists its own organisation''s workbooks only; % belongs to another' , w.code using errcode = 'AKW03';
    end if;
  end if;
  return new;
end $$;
create trigger tenant_listings_guard before insert or update on public.tenant_listings
  for each row execute function app.guard_tenant_listing();

-- The tenant's catalogue as cards: visible listings of public workbooks on an
-- active tenant, in the tenant's order. Names only, never legal names. The
-- price point is the listing's own, else the workbook's.
create or replace function public.tenant_catalogue(p_tenant uuid)
returns table (
  workbook_id uuid, code text, slug text, title text, card_line text, badge text, is_demo boolean,
  depth text, safety_tier text, genre_name text, authors text[], has_version boolean,
  featured boolean, sort int, price_point_id text)
language sql stable security definer set search_path = '' as $$
  select w.id, w.code, w.slug, w.title, w.card_line, w.badge, w.is_demo, w.depth, w.safety_tier,
         g.name,
         coalesce((select array_agg(a.display_name order by bc.sort)
                   from public.book_contributors bc join public.authors a on a.id = bc.author_id
                   where bc.book_id = w.book_id and bc.role = 'author'), '{}'),
         w.current_version_id is not null,
         l.featured, l.sort, coalesce(l.price_point_id, w.price_point_id)
  from public.tenant_listings l
  join public.tenants t on t.id = l.tenant_id
  join public.workbooks w on w.id = l.workbook_id
  left join public.genres g on g.id = w.genre_id
  where l.tenant_id = p_tenant and l.visible and t.status = 'active' and app.workbook_is_public(w.id)
  order by l.featured desc, l.sort, w.title
  limit 200
$$;
revoke execute on function public.tenant_catalogue(uuid) from public;
grant execute on function public.tenant_catalogue(uuid) to anon, authenticated, service_role;

-- ===========================================================================
-- 5. Demo logins (F-045).
--
-- No accounts or passwords are made here. Crent creates the demo author and
-- demo publisher sign-ins himself (docs/WHITE_LABEL_DEMO.md), then a platform
-- owner registers each one by email. The reset gives registered accounts
-- their places in the demo organisation and nothing else. A staff account,
-- or an account that belongs to any real organisation, is refused, so a
-- reset can never touch real work.
-- ===========================================================================

create table public.demo_accounts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('author','publisher')),
  added_by   uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.demo_accounts enable row level security;
revoke all on public.demo_accounts from anon, authenticated;
grant select on public.demo_accounts to authenticated;
create policy demo_accounts_staff_read on public.demo_accounts for select to authenticated
  using ((select app.is_platform(array['owner','editor'])));

-- ===========================================================================
-- 6. The demo publisher, its tenant and the reset (F-074, F-045).
--
-- Fixed ids so the app can name the demo tenant without a lookup (lib/tenant.ts):
--   organisation  00000000-0000-0000-0000-0000000000d0  Quillmoor Demo Press
--   tenant        00000000-0000-0000-0000-0000000000d1  slug demo
-- Everything is invented, is_demo, and labelled Demo on every surface. The
-- tenant sells nothing: demo workbooks cannot be bought (0004) and are kept
-- out of the membership (0010), and there is no tenant checkout.
--
-- The reset puts the demo organisation back exactly: its name, two imprints,
-- two demo authors, four workbooks in draft, in review, live and paused, the
-- tenant with the chosen look, the tenant catalogue, and the registered demo
-- accounts as the only members. Workbooks a demo user added are retired (AK
-- codes are never deleted or reused). It is idempotent.
-- ===========================================================================

create or replace function app.demo_brand(p_look text) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p_look = 'b' then
    '{"v": 1,
      "colours": {"light": {"primary": "#23395d", "accent": "#8a5a12"},
                  "dark":  {"primary": "#a9c4ef", "accent": "#5c3d0a"}},
      "font": "humanist",
      "logo": {"src": "/brand/demo/logo-b.svg", "alt": "Quillmoor Demo Press"},
      "favicon": "/brand/demo/favicon-b.svg",
      "sender_name": "Quillmoor Demo Press"}'::jsonb
  else
    '{"v": 1,
      "colours": {"light": {"primary": "#6b2d5c", "accent": "#2e5e57"},
                  "dark":  {"primary": "#e4a9d3", "accent": "#1f4a44"}},
      "font": "serif",
      "logo": {"src": "/brand/demo/logo-a.svg", "alt": "Quillmoor Demo Press"},
      "favicon": "/brand/demo/favicon-a.svg",
      "sender_name": "Quillmoor Demo Press"}'::jsonb
  end
$$;

insert into public.app_config (key, value) values ('demo_tenant_look', '"a"'::jsonb)
on conflict (key) do nothing;

-- The tenant row must exist before the reset's workbook inserts reference
-- it, so the reset creates it up front through this helper.
create or replace function app.ensure_demo_tenant() returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, status, is_demo)
  values ('00000000-0000-0000-0000-0000000000d0', 'PB-DEM00', 'publisher',
          'Quillmoor Demo Press (invented for the Akana demo)', 'Quillmoor Demo Press', 'quillmoor-demo-press', 'GB', 'active', true)
  on conflict (id) do nothing;
  insert into public.tenants (id, slug, kind, org_id, name, brand, default_locale, default_currency, seller_of_record, plan, status, is_demo)
  values ('00000000-0000-0000-0000-0000000000d1', 'demo', 'white_label', '00000000-0000-0000-0000-0000000000d0',
          'Quillmoor Demo Press', app.demo_brand('a'), 'en-GB', 'GBP', 'akana', 'demo', 'active', true)
  on conflict (id) do nothing;
end $$;
revoke execute on function app.ensure_demo_tenant() from public, anon, authenticated;

create or replace function app.reset_demo_state(p_look text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c_org    constant uuid := '00000000-0000-0000-0000-0000000000d0';
  c_tenant constant uuid := '00000000-0000-0000-0000-0000000000d1';
  c_imp_a  constant uuid := '00000000-0000-0000-0000-0000000000d2';
  c_imp_b  constant uuid := '00000000-0000-0000-0000-0000000000d3';
  c_au_a   constant uuid := '00000000-0000-0000-0000-0000000000d4';
  c_au_b   constant uuid := '00000000-0000-0000-0000-0000000000d5';
  v_look   text;
  v_wb     record;
  v_n      int;
  v_listed int;
  v_members int;
  v_retired int;
  v_publisher uuid;
  v_author uuid;
begin
  v_look := coalesce(nullif(p_look, ''), (select c.value #>> '{}' from public.app_config c where c.key = 'demo_tenant_look'), 'a');
  if v_look not in ('a','b') then
    raise exception 'look must be a or b' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.app_config (key, value) values ('demo_tenant_look', to_jsonb(v_look))
  on conflict (key) do update set value = excluded.value, updated_at = now();

  perform app.ensure_demo_tenant();

  -- The publisher.
  insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, status, is_demo)
  values (c_org, 'PB-DEM00', 'publisher', 'Quillmoor Demo Press (invented for the Akana demo)', 'Quillmoor Demo Press',
          'quillmoor-demo-press', 'GB', 'active', true)
  on conflict (id) do update set code = excluded.code, kind = excluded.kind, legal_name = excluded.legal_name,
    display_name = excluded.display_name, slug = excluded.slug, country = excluded.country,
    status = excluded.status, is_demo = true;

  insert into public.imprints (id, org_id, name) values
    (c_imp_a, c_org, 'Quillmoor Everyday'),
    (c_imp_b, c_org, 'Quillmoor Small Hours')
  on conflict (id) do update set org_id = excluded.org_id, name = excluded.name;
  delete from public.imprints where org_id = c_org and id not in (c_imp_a, c_imp_b);

  insert into public.authors (id, code, org_id, slug, display_name, bio, country, is_demo, status) values
    (c_au_a, 'AU-DEM01', c_org, 'odalys-penhaligon-reyes-demo', 'Odalys Penhaligon-Reyes',
     'An invented author for the Akana demo. Not a real person.', 'GB', true, 'active'),
    (c_au_b, 'AU-DEM02', c_org, 'bram-okonkwo-lindqvist-demo', 'Bram Okonkwo-Lindqvist',
     'An invented author for the Akana demo. Not a real person.', 'GB', true, 'active')
  on conflict (id) do update set code = excluded.code, org_id = excluded.org_id, slug = excluded.slug,
    display_name = excluded.display_name, bio = excluded.bio, country = excluded.country,
    is_demo = true, status = 'active', user_id = null;

  -- Four books and four workbooks, one in each state the portal shows.
  for v_wb in
    select * from (values
      ('00000000-0000-0000-0000-0000000000e1'::uuid, '00000000-0000-0000-0000-0000000000f1'::uuid, 'AK-DEM01',
       'quillmoor-ten-minute-desk', 'The Quillmoor Ten-Minute Desk', 'The Ten-Minute Desk',
       'A demo workbook for small daily planning habits. Invented for show.', 'productivity', c_imp_a, c_au_a, 'live'),
      ('00000000-0000-0000-0000-0000000000e2'::uuid, '00000000-0000-0000-0000-0000000000f2'::uuid, 'AK-DEM02',
       'quillmoor-notes-on-tidy-rooms', 'Quillmoor Notes on Tidy Rooms', 'Notes on Tidy Rooms',
       'A demo workbook about keeping a home easy to live in. Invented for show.', 'life_skills', c_imp_a, c_au_a, 'paused'),
      ('00000000-0000-0000-0000-0000000000e3'::uuid, '00000000-0000-0000-0000-0000000000f3'::uuid, 'AK-DEM03',
       'quillmoor-letters-to-next-year', 'Quillmoor Letters to Next Year', 'Letters to Next Year',
       'A demo workbook for writing down what you want next year to hold. Invented for show.', 'personal_development', c_imp_b, c_au_b, 'in_review'),
      ('00000000-0000-0000-0000-0000000000e4'::uuid, '00000000-0000-0000-0000-0000000000f4'::uuid, 'AK-DEM04',
       'quillmoor-study-lanterns', 'Quillmoor Study Lanterns', 'Study Lanterns',
       'A demo workbook for steady study habits. Invented for show.', 'education', c_imp_b, c_au_b, 'draft')
    ) as x(book_id, wb_id, code, slug, title, book_title, card_line, genre, imprint, author, status)
  loop
    insert into public.books (id, org_id, slug, title, language, rights_status, publisher, is_demo, imprint_id, genre_id)
    values (v_wb.book_id, c_org, v_wb.slug || '-book', v_wb.book_title, 'en', 'own_work', 'Quillmoor Demo Press', true, v_wb.imprint, v_wb.genre)
    on conflict (id) do update set org_id = excluded.org_id, slug = excluded.slug, title = excluded.title,
      language = excluded.language, rights_status = excluded.rights_status, publisher = excluded.publisher,
      is_demo = true, imprint_id = excluded.imprint_id, genre_id = excluded.genre_id;

    delete from public.book_contributors where book_id = v_wb.book_id;
    insert into public.book_contributors (book_id, author_id, role, sort) values (v_wb.book_id, v_wb.author, 'author', 0);

    insert into public.workbooks (id, code, book_id, org_id, tenant_id, slug, title, card_line, genre_id,
                                  safety_tier, depth, badge, is_demo, status, price_point_id)
    values (v_wb.wb_id, v_wb.code, v_wb.book_id, c_org, c_tenant, v_wb.slug, v_wb.title, v_wb.card_line, v_wb.genre,
            'none', 'listing', 'demo', true, v_wb.status, null)
    on conflict (id) do update set code = excluded.code, book_id = excluded.book_id, org_id = excluded.org_id,
      tenant_id = excluded.tenant_id, slug = excluded.slug, title = excluded.title, card_line = excluded.card_line,
      genre_id = excluded.genre_id, safety_tier = excluded.safety_tier, depth = excluded.depth, badge = 'demo',
      is_demo = true, status = excluded.status, price_point_id = null;
  end loop;

  -- Workbooks a demo user added since the last reset leave the demo.
  update public.workbooks set status = 'retired'
  where org_id = c_org and status <> 'retired'
    and id not in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2',
                   '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f4');
  get diagnostics v_retired = row_count;

  -- The tenant (created up front by app.ensure_demo_tenant, because the
  -- workbooks above reference it), back to its demo settings and chosen look.
  update public.tenants set name = 'Quillmoor Demo Press', brand = app.demo_brand(v_look), status = 'active',
    kind = 'white_label', org_id = c_org, is_demo = true, plan = 'demo', seller_of_record = 'akana'
  where id = c_tenant;

  -- The catalogue: the demo publisher's live title first, then up to eleven
  -- live demo titles from the marketplace catalogue, in code order. Two carry
  -- their own listing price to show the setting; it is display only.
  delete from public.tenant_listings where tenant_id = c_tenant;
  insert into public.tenant_listings (tenant_id, workbook_id, visible, sort, featured, price_point_id)
  values (c_tenant, '00000000-0000-0000-0000-0000000000f1', true, 0, true, 'p2');
  insert into public.tenant_listings (tenant_id, workbook_id, visible, sort, featured, price_point_id)
  select c_tenant, w.id, true, row_number() over (order by w.code)::int, false,
         case when row_number() over (order by w.code) = 1 then 'p3' else null end
  from public.workbooks w
  where w.is_demo and w.status = 'live' and w.org_id <> c_org
  order by w.code
  limit 11;
  select count(*) into v_listed from public.tenant_listings where tenant_id = c_tenant;

  -- Members: the registered demo accounts and nobody else. Owners first, so
  -- the last-owner guard (0001) is never tripped while others leave.
  insert into public.org_members (org_id, user_id, role)
  select c_org, d.user_id, case d.kind when 'publisher' then 'owner' else 'author' end
  from public.demo_accounts d
  on conflict (org_id, user_id) do update set role = excluded.role;

  if exists (select 1 from public.demo_accounts d where d.kind = 'publisher') then
    delete from public.org_members m where m.org_id = c_org and m.user_id not in (select d.user_id from public.demo_accounts d);
  else
    delete from public.org_members m where m.org_id = c_org and m.role <> 'owner'
      and m.user_id not in (select d.user_id from public.demo_accounts d);
  end if;
  select count(*) into v_members from public.org_members where org_id = c_org;

  delete from public.tenant_members where tenant_id = c_tenant and role <> 'reader';
  insert into public.tenant_members (tenant_id, user_id, role)
  select c_tenant, d.user_id, 'tenant_admin' from public.demo_accounts d where d.kind = 'publisher'
  on conflict (tenant_id, user_id) do update set role = 'tenant_admin';

  -- The first registered demo author is the login behind Odalys's profile.
  select d.user_id into v_author from public.demo_accounts d where d.kind = 'author' order by d.created_at limit 1;
  if v_author is not null then
    update public.authors set user_id = v_author where id = c_au_a;
  end if;
  select d.user_id into v_publisher from public.demo_accounts d where d.kind = 'publisher' order by d.created_at limit 1;

  perform app.audit('demo.reset', 'organisation:' || c_org::text, p_reason, c_tenant, c_org, null,
    jsonb_build_object('look', v_look, 'listed', v_listed, 'members', v_members, 'retired', v_retired));

  return jsonb_build_object('look', v_look, 'workbooks', 4, 'listed', v_listed, 'members', v_members,
                            'retired', v_retired, 'publisher_login', v_publisher is not null, 'author_login', v_author is not null);
end $$;
revoke execute on function app.reset_demo_state(text, text) from public, anon, authenticated;

-- Staff button: platform owners and editors.
create or replace function public.reset_demo_state(p_look text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.is_platform(array['owner','editor']) then
    raise exception 'only platform owners and editors reset the demo' using errcode = 'insufficient_privilege';
  end if;
  return app.reset_demo_state(p_look, 'staff reset');
end $$;
revoke execute on function public.reset_demo_state(text) from public, anon;
grant execute on function public.reset_demo_state(text) to authenticated;

-- Nightly job: the service role only, through /api/ops/demo-reset.
create or replace function public.reset_demo_state_job() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  return app.reset_demo_state(null, 'nightly reset');
end $$;
revoke execute on function public.reset_demo_state_job() from public, anon, authenticated;
grant execute on function public.reset_demo_state_job() to service_role;

-- Register a demo login by email. Platform owners only. The account must
-- already exist (Crent creates it), must not be staff, and must not belong
-- to any organisation other than the demo one.
create or replace function public.add_demo_account(p_email text, p_kind text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not app.is_platform(array['owner']) then
    raise exception 'only platform owners register demo logins' using errcode = 'insufficient_privilege';
  end if;
  if p_kind is null or p_kind not in ('author','publisher') then
    raise exception 'kind must be author or publisher' using errcode = 'AKW05';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, ''))) limit 1;
  if v_user is null then
    raise exception 'no account with that email; create the sign-in first' using errcode = 'AKW05';
  end if;
  if exists (select 1 from public.platform_roles r where r.user_id = v_user) then
    raise exception 'a staff account cannot be a demo login' using errcode = 'AKW05';
  end if;
  if exists (select 1 from public.org_members m where m.user_id = v_user and m.org_id <> '00000000-0000-0000-0000-0000000000d0') then
    raise exception 'this account belongs to a real organisation and cannot be a demo login' using errcode = 'AKW05';
  end if;
  insert into public.demo_accounts (user_id, kind, added_by) values (v_user, p_kind, app.uid())
  on conflict (user_id) do update set kind = excluded.kind, added_by = excluded.added_by;
  -- Ids only in the audit row: never the email.
  perform app.audit('demo.account_added', 'user:' || v_user::text, null, '00000000-0000-0000-0000-0000000000d1',
    '00000000-0000-0000-0000-0000000000d0', null, jsonb_build_object('kind', p_kind));
  return v_user;
end $$;
revoke execute on function public.add_demo_account(text, text) from public, anon;
grant execute on function public.add_demo_account(text, text) to authenticated;

create or replace function public.remove_demo_account(p_user uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  if not app.is_platform(array['owner']) then
    raise exception 'only platform owners remove demo logins' using errcode = 'insufficient_privilege';
  end if;
  delete from public.demo_accounts where user_id = p_user;
  get diagnostics n = row_count;
  if n > 0 then
    -- Leaves the organisation now unless it is the last owner; the next reset tidies up.
    delete from public.org_members m where m.org_id = '00000000-0000-0000-0000-0000000000d0' and m.user_id = p_user
      and (m.role <> 'owner' or exists (select 1 from public.org_members o
             where o.org_id = m.org_id and o.role = 'owner' and o.user_id <> p_user));
    delete from public.tenant_members where tenant_id = '00000000-0000-0000-0000-0000000000d1' and user_id = p_user and role <> 'reader';
    update public.authors set user_id = null where id = '00000000-0000-0000-0000-0000000000d4' and user_id = p_user;
    perform app.audit('demo.account_removed', 'user:' || p_user::text, null, '00000000-0000-0000-0000-0000000000d1',
      '00000000-0000-0000-0000-0000000000d0', null, null);
  end if;
  return n > 0;
end $$;
revoke execute on function public.remove_demo_account(uuid) from public, anon;
grant execute on function public.remove_demo_account(uuid) to authenticated;

-- Staff list of demo logins with their emails, for the admin page. Owners and editors.
create or replace function public.demo_account_list()
returns table (user_id uuid, email text, kind text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.user_id, u.email::text, d.kind, d.created_at
  from public.demo_accounts d join auth.users u on u.id = d.user_id
  where app.is_platform(array['owner','editor'])
  order by d.kind, d.created_at
$$;
revoke execute on function public.demo_account_list() from public, anon;
grant execute on function public.demo_account_list() to authenticated;
