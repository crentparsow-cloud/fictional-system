-- 0064 Platform: feature flags per cohort, white-label shape, reader prompts
-- (build list 10.5, 1.10, 13.3).
--
-- What changes
--   1. public.feature_flags gains rollout_percent (0 to 100, default 100) and
--      cohort (true for flags staff may roll out in steps). A global flag that
--      is enabled with a rollout below 100 is on for that share of readers.
--      A reader's place is fixed: bucket = first four bytes of
--      sha256(key || ':' || user id), read as an unsigned number, mod 100. The
--      same reader always lands in the same bucket for a flag, and raising the
--      percentage only ever adds readers. apps/web/lib/flags.ts computes the
--      same number, and a test pins both to one known value.
--   2. app.flag_for_user(key, user) and public.flag_on(key) answer for the
--      signed-in reader. Flags default off. Three new ones are seeded off:
--      reader_passkeys, web_push, programme_friends.
--   3. public.set_flag(key, enabled, percent, reason) is the one way the admin
--      console changes a cohort flag. Platform owners only, cohort flags only
--      (live_payments and the launch toggles cannot be moved from here), and
--      every change is written to the audit log.
--   4. app.tenant_brand_problems (0023) is replaced with its body copied and
--      one addition, marked "0064": a brand may set "shape" to square, soft or
--      round, the three corner sets of the design system. Nothing else about
--      the brand contract changes, and the contrast rules still apply.
--   5. public.reader_prompts records that a reader dismissed a one-time
--      prompt (today only the passkey prompt). One row per reader and prompt,
--      readable and writable by that reader only.
--
-- Depends on 0001 to 0048. Safe to run twice. Nothing earlier is edited.

-- ---------------------------------------------------------------------------
-- 1. Cohort columns on feature_flags
-- ---------------------------------------------------------------------------
alter table public.feature_flags add column if not exists rollout_percent smallint not null default 100;
alter table public.feature_flags add column if not exists cohort boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.feature_flags'::regclass and conname = 'feature_flags_rollout_range') then
    alter table public.feature_flags add constraint feature_flags_rollout_range check (rollout_percent between 0 and 100);
  end if;
end $$;

insert into public.feature_flags (key, scope, enabled, reason, cohort, rollout_percent) values
  ('reader_passkeys',   'global', false, 'Offer readers a passkey as an extra check after sign-in (10.8, 13.3). Needs mfa_passkey on too.', true, 0),
  ('web_push',          'global', false, 'Daily step notification for installed readers (13.19). Needs the VAPID keys in the environment.', true, 0),
  ('programme_friends', 'global', false, 'Do a programme with a friend (6.2): status and pre-written nudges only.', true, 0)
on conflict (key, scope, scope_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Deterministic bucketing
-- ---------------------------------------------------------------------------
create or replace function app.flag_bucket(p_user uuid, p_key text) returns int
language sql immutable set search_path = '' as $$
  select ((('x' || encode(substring(sha256(convert_to(p_key || ':' || p_user::text, 'UTF8')) from 1 for 4), 'hex'))::bit(32)::bigint) % 100)::int
$$;

create or replace function app.flag_for_user(p_key text, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select f.enabled and (f.rollout_percent >= 100 or (p_user is not null and app.flag_bucket(p_user, p_key) < f.rollout_percent))
      from public.feature_flags f
     where f.key = p_key and f.scope = 'global' and f.scope_id = ''
  ), false)
$$;

create or replace function public.flag_on(p_key text) returns boolean
language sql stable security invoker set search_path = '' as $$ select app.flag_for_user(p_key, app.uid()) $$;

-- ---------------------------------------------------------------------------
-- 3. The admin switch
-- ---------------------------------------------------------------------------
create or replace function public.set_flag(p_key text, p_enabled boolean, p_percent int, p_reason text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_before public.feature_flags%rowtype;
begin
  if not app.is_platform(array['owner']) then
    raise exception 'only platform owners change feature flags' using errcode = 'insufficient_privilege';
  end if;
  if p_percent is null or p_percent < 0 or p_percent > 100 then
    raise exception 'rollout must be between 0 and 100' using errcode = 'invalid_parameter_value';
  end if;
  if p_enabled is null then
    raise exception 'say whether the flag is on' using errcode = 'invalid_parameter_value';
  end if;
  select * into v_before from public.feature_flags where key = p_key and scope = 'global' and scope_id = '' and cohort for update;
  if not found then
    raise exception 'unknown cohort flag' using errcode = 'no_data_found';
  end if;
  update public.feature_flags
     set enabled = p_enabled, rollout_percent = p_percent, reason = coalesce(nullif(btrim(p_reason), ''), reason),
         updated_by = app.uid(), updated_at = now()
   where key = p_key and scope = 'global' and scope_id = '';
  perform app.audit('flag.changed', 'flag:' || p_key, nullif(btrim(p_reason), ''), null, null,
    jsonb_build_object('enabled', v_before.enabled, 'rollout_percent', v_before.rollout_percent),
    jsonb_build_object('enabled', p_enabled, 'rollout_percent', p_percent));
end $$;

revoke execute on function app.flag_bucket(uuid, text), app.flag_for_user(text, uuid) from public, anon;
grant execute on function app.flag_bucket(uuid, text), app.flag_for_user(text, uuid) to authenticated, service_role;
revoke execute on function public.flag_on(text), public.set_flag(text, boolean, int, text) from public, anon;
grant execute on function public.flag_on(text), public.set_flag(text, boolean, int, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Brand validation with the design system's shape (1.10)
-- ---------------------------------------------------------------------------
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
    if k not in ('v','colours','font','shape','logo','favicon','footer_links','legal_links','sender_name') then
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

  -- 0064: the corner set of the design system. Three fixed looks, no free values.
  if p_brand ? 'shape' and coalesce(p_brand->>'shape', '') not in ('square','soft','round') then
    out := out || 'shape must be one of square, soft, round'::text;
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

-- ---------------------------------------------------------------------------
-- 5. One-time prompts a reader dismissed
-- ---------------------------------------------------------------------------
create table if not exists public.reader_prompts (
  user_id      uuid not null references auth.users(id) on delete cascade,
  prompt       text not null check (prompt in ('passkey')),
  declined_at  timestamptz not null default now(),
  primary key (user_id, prompt)
);
alter table public.reader_prompts enable row level security;
revoke all on public.reader_prompts from public, anon, authenticated;
grant select, insert on public.reader_prompts to authenticated;
drop policy if exists reader_prompts_read on public.reader_prompts;
create policy reader_prompts_read on public.reader_prompts for select to authenticated
  using (user_id = (select app.uid()));
drop policy if exists reader_prompts_insert on public.reader_prompts;
create policy reader_prompts_insert on public.reader_prompts for insert to authenticated
  with check (user_id = (select app.uid()));
