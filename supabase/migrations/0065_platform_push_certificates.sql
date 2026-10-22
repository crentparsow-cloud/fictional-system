-- 0065 Platform: Web Push for installed readers, and the finish certificate
-- (build list 13.19, 12.2).
--
-- What changes
--   1. public.push_subscriptions holds a reader's browser push endpoints, up
--      to five. A reader sees and removes their own; saving goes through
--      public.save_push_subscription, which also moves an endpoint to the
--      signed-in reader when a shared device changes hands. The keys are kept
--      because the browser issues them with the subscription, but Akana sends
--      no message body (the notification text is fixed in the service worker),
--      so nothing about a reader or a title ever travels in a push.
--   2. public.push_log claims one push per reader per local day, so a second
--      run of the cron job, or two schedulers, sends nothing new. Service role
--      only. Rows older than 60 days are removed by public.prune_push_log().
--   3. public.certificates is the finish certificate (12.2). One per
--      finished enrolment, private by default: only the reader can read it,
--      and the page shows no date. The reader may turn on a public link, which
--      is stored as a sha256 hash only. Public links are refused for any
--      workbook above safety tier none, so a certificate for a mental health
--      title can never be made visible to anyone else.
--
-- Depends on 0001 to 0048 and 0064. Nothing earlier is edited. Safe to run
-- twice.

-- ---------------------------------------------------------------------------
-- 1. Push subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique check (endpoint ~ '^https://[^[:space:]]+$' and char_length(endpoint) <= 1000),
  p256dh     text not null check (char_length(p256dh) between 1 and 200),
  auth       text not null check (char_length(auth) between 1 and 100),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  failures   smallint not null default 0
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;
grant select (id, user_id, created_at) on public.push_subscriptions to authenticated;
grant delete on public.push_subscriptions to authenticated;
grant select, update, delete on public.push_subscriptions to service_role;
drop policy if exists push_subscriptions_read on public.push_subscriptions;
create policy push_subscriptions_read on public.push_subscriptions for select to authenticated
  using (user_id = (select app.uid()));
drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (user_id = (select app.uid()));

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := app.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://[^[:space:]]+$' or char_length(p_endpoint) > 1000 then
    raise exception 'that is not a push address' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(char_length(p_p256dh), 0) not between 1 and 200 or coalesce(char_length(p_auth), 0) not between 1 and 100 then
    raise exception 'the push keys are missing' using errcode = 'invalid_parameter_value';
  end if;
  -- A reader keeps at most five devices; the oldest goes when a sixth is added.
  if not exists (select 1 from public.push_subscriptions where endpoint = p_endpoint and user_id = v_uid)
     and (select count(*) from public.push_subscriptions where user_id = v_uid) >= 5 then
    delete from public.push_subscriptions
     where id = (select id from public.push_subscriptions where user_id = v_uid order by created_at asc limit 1);
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, failures = 0
  returning id into v_id;
  return v_id;
end $$;

-- A reader removes a device by its address. The endpoint column is not readable
-- by the client, so this goes through a function that only touches their own row.
create or replace function public.remove_push_subscription(p_endpoint text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  if app.uid() is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = app.uid();
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ---------------------------------------------------------------------------
-- 2. One push a day
-- ---------------------------------------------------------------------------
create table if not exists public.push_log (
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  sent_at    timestamptz not null default now(),
  primary key (user_id, local_date)
);
alter table public.push_log enable row level security;
revoke all on public.push_log from public, anon, authenticated;
grant select, insert, delete on public.push_log to service_role;

create or replace function public.prune_push_log() returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare n bigint;
begin
  if not app.is_service_role() then
    raise exception 'only the service role prunes the push log' using errcode = 'insufficient_privilege';
  end if;
  delete from public.push_log where sent_at < now() - interval '60 days';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Finish certificate
-- ---------------------------------------------------------------------------
create table if not exists public.certificates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  enrolment_id    uuid not null unique references public.enrolments(id) on delete cascade,
  holder_name     text check (holder_name is null or (char_length(btrim(holder_name)) between 1 and 60 and holder_name !~ '[<>[:cntrl:]]')),
  share_hash      text unique check (share_hash is null or share_hash ~ '^[0-9a-f]{64}$'),
  created_at      timestamptz not null default now()
);
create index if not exists certificates_user_idx on public.certificates(user_id);

alter table public.certificates enable row level security;
revoke all on public.certificates from public, anon, authenticated;
-- The share hash is not readable by the client; the reader reads their own row without it.
grant select (id, user_id, enrolment_id, holder_name, created_at) on public.certificates to authenticated;
grant select, insert, update, delete on public.certificates to service_role;
drop policy if exists certificates_read on public.certificates;
create policy certificates_read on public.certificates for select to authenticated
  using (user_id = (select app.uid()));

-- Make (or rename) the certificate for a finished programme. The programme is
-- finished when the reader reached the end: a 'finished' event, or the status.
create or replace function public.make_certificate(p_enrolment uuid, p_name text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid  uuid := app.uid();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_id   uuid;
begin
  if v_uid is null or not app.enrolment_owner(p_enrolment) then
    raise exception 'not your programme' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.enrolments e
     where e.id = p_enrolment
       and (e.status = 'finished' or exists (select 1 from public.progress_events p where p.enrolment_id = e.id and p.kind = 'finished'))
  ) then
    raise exception 'the programme is not finished yet' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if v_name is not null and (char_length(v_name) > 60 or v_name ~ '[<>[:cntrl:]]') then
    raise exception 'the name must be plain text of up to 60 characters' using errcode = 'check_violation';
  end if;
  insert into public.certificates (user_id, enrolment_id, holder_name)
  values (v_uid, p_enrolment, v_name)
  on conflict (enrolment_id) do update set holder_name = excluded.holder_name
  returning id into v_id;
  return v_id;
end $$;

-- The reader's own certificate for a programme, with whether a public link is on.
create or replace function public.my_certificate(p_enrolment uuid) returns table (id uuid, holder_name text, shared boolean, shareable boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.holder_name, c.share_hash is not null,
         w.safety_tier::text = 'none'
    from public.certificates c
    join public.enrolments e on e.id = c.enrolment_id
    join public.workbooks w on w.id = e.workbook_id
   where c.enrolment_id = p_enrolment and c.user_id = app.uid()
$$;

-- Turn the public link on (pass the sha256 hash of a token the server made) or off (pass null).
create or replace function public.set_certificate_share(p_enrolment uuid, p_hash text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_tier text;
begin
  if app.uid() is null or not exists (select 1 from public.certificates c where c.enrolment_id = p_enrolment and c.user_id = app.uid()) then
    raise exception 'not your certificate' using errcode = 'insufficient_privilege';
  end if;
  if p_hash is not null then
    if p_hash !~ '^[0-9a-f]{64}$' then
      raise exception 'bad link hash' using errcode = 'invalid_parameter_value';
    end if;
    select w.safety_tier::text into v_tier
      from public.enrolments e join public.workbooks w on w.id = e.workbook_id where e.id = p_enrolment;
    if v_tier is distinct from 'none' then
      raise exception 'a certificate for this title stays private' using errcode = 'object_not_in_prerequisite_state';
    end if;
  end if;
  update public.certificates set share_hash = p_hash where enrolment_id = p_enrolment;
end $$;

-- The public page's lookup. Service role only. Returns the title and the name
-- the reader typed, and only for a title at safety tier none.
create or replace function public.certificate_by_hash(p_hash text) returns table (title text, holder_name text, slug text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads a shared certificate' using errcode = 'insufficient_privilege';
  end if;
  return query
  select w.title::text, c.holder_name, w.slug::text
    from public.certificates c
    join public.enrolments e on e.id = c.enrolment_id
    join public.workbooks w on w.id = e.workbook_id
   where c.share_hash = p_hash and w.safety_tier::text = 'none';
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function
  public.save_push_subscription(text, text, text), public.remove_push_subscription(text), public.prune_push_log(),
  public.make_certificate(uuid, text), public.my_certificate(uuid), public.set_certificate_share(uuid, text),
  public.certificate_by_hash(text)
  from public, anon;
grant execute on function public.save_push_subscription(text, text, text), public.remove_push_subscription(text), public.make_certificate(uuid, text),
  public.my_certificate(uuid), public.set_certificate_share(uuid, text) to authenticated;
grant execute on function public.prune_push_log(), public.certificate_by_hash(text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. The push job, every 15 minutes through the 0040 cron helper. Guarded the
-- way 0040 is: where pg_cron is not present (a plain Postgres test database)
-- the block says so and the rest of the migration stands. The route does
-- nothing while the VAPID keys are blank.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regnamespace('cron') is not null then
    execute format('select cron.schedule(%L, %L, %L)', 'akana-push-daily', '*/15 * * * *',
                   format('select app.call_cron_route(%L, %L)', 'push-daily', '/api/push/daily'));
    raise notice '0065: pg_cron job akana-push-daily scheduled.';
  else
    raise notice '0065: pg_cron is not present, so the push job was not scheduled. See docs/CRON.md.';
  end if;
exception when others then
  raise notice '0065: job scheduling skipped (sqlstate %).', sqlstate;
end $$;
