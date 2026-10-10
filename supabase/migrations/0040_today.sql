-- 0040 Today: the reasons to return, and the database jobs behind them (build
-- list 4.1, 4.2, 4.3, 4.7, 14.3, 4.8, 4.9, 14.5, 12.10 and 14.8).
--
-- Same rules as 0001 to 0039. Nothing earlier is edited. Every table has RLS
-- on, grants are given back column by column where a client may write only
-- some columns, and every function is security definer with search_path
-- pinned to ''. Depends on 0001, 0003, 0004, 0007 and 0010.
--
-- Mental health titles (safety tier standard or higher): nothing here counts
-- days, nothing expires and nothing nags. Reminders, the daily review and the
-- welcome-back note are off until the reader turns them on from You. The
-- switches are columns here and the defaults by tier are in the app
-- (apps/web/lib/today). Reader answers stay sealed: no table below holds
-- reader text. They hold ids, dates, choices and counts only.
--
-- 1. today_settings: one row per enrolment. Reminder days and time, the
--    review dial, the welcome-back switch and the hash of the calendar link.
-- 2. reminder_log: what was sent, by ids and local date. Service role only.
--    It drives the stop rule (14.3): reminders sent since the reader last did
--    anything in the programme.
-- 3. review_marks: keep and set aside on an answer (4.3). review_queue: the
--    answer id chosen for a day, no content (the daily job fills it).
-- 4. toolkit_saves: a toolkit card the reader saved for Today.
-- 5. reading_places: the exact place of a pause (14.5), ids only.
-- 6. Service-only reads for the jobs: reminder_targets, review_targets.
-- 7. new_calendar_token: makes the ICS link and keeps only its hash (4.8).
-- 8. Supabase Cron and Vault (14.8): cron_runs, app.call_cron_route and three
--    pg_cron jobs, created only where pg_cron, pg_net and Vault can be
--    enabled. Elsewhere the migration says so and carries on.

-- ---------------------------------------------------------------------------
-- 0. Config the jobs and the app read. Not secret (app_config is public).
--    cron_base_url stays empty until Crent sets it; the jobs log "skipped"
--    until then.
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value) values
  ('reminder_stop_after', '4'),
  ('pickup_gap_days', '14'),
  ('break_after_minutes', '45'),
  ('cron_base_url', '""')
on conflict (key) do nothing;

create or replace function app.valid_timezone(p_tz text) returns boolean
language sql stable set search_path = '' as $$
  select p_tz is not null and length(p_tz) between 1 and 64
     and exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_tz)
$$;

-- ---------------------------------------------------------------------------
-- 1. today_settings
-- ---------------------------------------------------------------------------
create table public.today_settings (
  enrolment_id         uuid primary key references public.enrolments(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  reminders_on         boolean not null default false,
  reminder_days        smallint[] not null default '{}'
                         check (reminder_days <@ array[1,2,3,4,5,6,7]::smallint[] and cardinality(reminder_days) <= 7),
  reminder_time        time not null default '09:00',
  timezone             text not null default 'Europe/London' check (app.valid_timezone(timezone)),
  -- Set by the job when it sends the one stopping email. Cleared when the
  -- reader turns reminders back on.
  reminders_stopped_at timestamptz,
  -- null means the default for the title's tier: sometimes, or off for a
  -- wellbeing title. Chosen values: off, rarely, sometimes, often.
  review_frequency     text check (review_frequency in ('off','rarely','sometimes','often')),
  -- The welcome-back note on Today and by email. null means on, or off for a
  -- wellbeing title.
  pickup_on            boolean,
  -- sha256 of the calendar link's token. The token itself is shown once.
  calendar_token_hash  text unique check (calendar_token_hash ~ '^[0-9a-f]{64}$'),
  updated_at           timestamptz not null default now()
);
create index today_settings_user_idx on public.today_settings(user_id);
create index today_settings_reminders_idx on public.today_settings(enrolment_id) where reminders_on;

create or replace function app.today_settings_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  -- Turning reminders on again starts clean.
  if tg_op = 'UPDATE' and new.reminders_on and not old.reminders_on then
    new.reminders_stopped_at := null;
  end if;
  return new;
end $$;
create trigger today_settings_touch before insert or update on public.today_settings
  for each row execute function app.today_settings_touch();

alter table public.today_settings enable row level security;
revoke all on public.today_settings from anon, authenticated;
-- A reader writes the choices, never the stop stamp or the link hash.
grant select on public.today_settings to authenticated;
grant insert (enrolment_id, user_id, reminders_on, reminder_days, reminder_time, timezone, review_frequency, pickup_on)
  on public.today_settings to authenticated;
-- enrolment_id and user_id are in the update list because an upsert from the
-- client names every column; the policies below still pin both to the reader.
grant update (enrolment_id, user_id, reminders_on, reminder_days, reminder_time, timezone, review_frequency, pickup_on)
  on public.today_settings to authenticated;
grant select, insert, update on public.today_settings to service_role;
create policy today_settings_read on public.today_settings for select to authenticated
  using (user_id = (select app.uid()));
create policy today_settings_insert on public.today_settings for insert to authenticated
  with check (user_id = (select app.uid()) and (select app.enrolment_owner(enrolment_id)));
create policy today_settings_update on public.today_settings for update to authenticated
  using (user_id = (select app.uid()))
  with check (user_id = (select app.uid()) and (select app.enrolment_owner(enrolment_id)));

-- ---------------------------------------------------------------------------
-- 2. reminder_log. Ids and a local date only. No address, no title, no text.
-- ---------------------------------------------------------------------------
create table public.reminder_log (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  enrolment_id uuid not null references public.enrolments(id) on delete cascade,
  kind         text not null check (kind in ('step','stopping','welcome_back')),
  ref          text check (ref is null or length(ref) <= 120),
  local_date   date not null,
  sent_at      timestamptz not null default now()
);
create index reminder_log_enrolment_idx on public.reminder_log(enrolment_id, sent_at desc);
-- One row per reader-visible email: the same step is not logged twice in a day.
create unique index reminder_log_once_idx on public.reminder_log(enrolment_id, kind, coalesce(ref, ''), local_date);

alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;
grant select, insert on public.reminder_log to service_role;
-- No policy for clients: nobody reads or writes this from a browser.

-- ---------------------------------------------------------------------------
-- 3. review_marks and review_queue
-- ---------------------------------------------------------------------------
create table public.review_marks (
  answer_id    uuid primary key references public.answers(id) on delete cascade,
  enrolment_id uuid not null references public.enrolments(id) on delete cascade,
  state        text not null check (state in ('kept','set_aside')),
  updated_at   timestamptz not null default now()
);
create index review_marks_enrolment_idx on public.review_marks(enrolment_id);

alter table public.review_marks enable row level security;
revoke all on public.review_marks from anon, authenticated;
-- Soft actions only: a mark can change between the two states. No delete.
grant select, insert, update on public.review_marks to authenticated;
grant select, insert, update on public.review_marks to service_role;
create policy review_marks_read on public.review_marks for select to authenticated
  using ((select app.enrolment_owner(enrolment_id)));
create policy review_marks_insert on public.review_marks for insert to authenticated
  with check ((select app.enrolment_owner(enrolment_id))
          and exists (select 1 from public.answers a where a.id = answer_id and a.enrolment_id = review_marks.enrolment_id));
create policy review_marks_update on public.review_marks for update to authenticated
  using ((select app.enrolment_owner(enrolment_id)))
  with check ((select app.enrolment_owner(enrolment_id))
          and exists (select 1 from public.answers a where a.id = answer_id and a.enrolment_id = review_marks.enrolment_id));

create table public.review_queue (
  enrolment_id uuid not null references public.enrolments(id) on delete cascade,
  for_day      date not null,
  answer_id    uuid not null references public.answers(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (enrolment_id, for_day)
);
create index review_queue_answer_idx on public.review_queue(answer_id);

alter table public.review_queue enable row level security;
revoke all on public.review_queue from anon, authenticated;
grant select on public.review_queue to authenticated;
grant select, insert, delete on public.review_queue to service_role;
create policy review_queue_read on public.review_queue for select to authenticated
  using ((select app.enrolment_owner(enrolment_id)));

-- ---------------------------------------------------------------------------
-- 4. toolkit_saves
-- ---------------------------------------------------------------------------
create table public.toolkit_saves (
  enrolment_id uuid not null references public.enrolments(id) on delete cascade,
  tool_id      text not null check (tool_id ~ '^[a-z0-9][a-z0-9_:~.-]{0,79}$'),
  saved_at     timestamptz not null default now(),
  primary key (enrolment_id, tool_id)
);

alter table public.toolkit_saves enable row level security;
revoke all on public.toolkit_saves from anon, authenticated;
grant select, insert, delete on public.toolkit_saves to authenticated;
create policy toolkit_saves_read on public.toolkit_saves for select to authenticated
  using ((select app.enrolment_owner(enrolment_id)));
create policy toolkit_saves_insert on public.toolkit_saves for insert to authenticated
  with check ((select app.enrolment_owner(enrolment_id)));
create policy toolkit_saves_delete on public.toolkit_saves for delete to authenticated
  using ((select app.enrolment_owner(enrolment_id)));

-- ---------------------------------------------------------------------------
-- 5. reading_places: the exact place of a pause. Ids only, never a value.
-- ---------------------------------------------------------------------------
create table public.reading_places (
  enrolment_id uuid primary key references public.enrolments(id) on delete cascade,
  unit         int not null check (unit between 1 and 999),
  exercise_id  text check (exercise_id is null or exercise_id ~ '^[a-z0-9][a-z0-9_:~.-]{0,79}$'),
  page         text check (page is null or page in ('purpose','steps','example','yours','done')),
  field_id     text check (field_id is null or field_id ~ '^[a-z0-9][a-z0-9_:~.-]{0,79}$'),
  mode         text check (mode is null or mode in ('full','short')),
  -- True when the reader pressed Pause. The next plain open resumes here.
  paused       boolean not null default false,
  updated_at   timestamptz not null default now()
);

alter table public.reading_places enable row level security;
revoke all on public.reading_places from anon, authenticated;
grant select, insert, update on public.reading_places to authenticated;
create policy reading_places_read on public.reading_places for select to authenticated
  using ((select app.enrolment_owner(enrolment_id)));
create policy reading_places_insert on public.reading_places for insert to authenticated
  with check ((select app.enrolment_owner(enrolment_id)));
create policy reading_places_update on public.reading_places for update to authenticated
  using ((select app.enrolment_owner(enrolment_id)))
  with check ((select app.enrolment_owner(enrolment_id)));

-- ---------------------------------------------------------------------------
-- 6. Service-only reads for the jobs. They return ids, settings and counts.
--    The reminder one also returns the address, because the mailer needs it;
--    the route never logs or returns it.
-- ---------------------------------------------------------------------------
create or replace function public.reminder_targets() returns table (
  enrolment_id uuid, user_id uuid, email text, workbook_id uuid, version_id uuid, safety_tier text,
  last_opened_at timestamptz, last_activity timestamptz, sent_since_activity int,
  reminder_days smallint[], reminder_time time, timezone text, pickup_on boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads reminder targets' using errcode = 'insufficient_privilege';
  end if;
  return query
  select s.enrolment_id, s.user_id, u.email::text, e.workbook_id, e.version_id, w.safety_tier::text,
         e.last_opened_at, a.last_activity,
         (select count(*)::int from public.reminder_log r
           where r.enrolment_id = e.id and r.kind = 'step' and r.sent_at > a.last_activity),
         s.reminder_days, s.reminder_time, s.timezone, s.pickup_on
    from public.today_settings s
    join public.enrolments e on e.id = s.enrolment_id and e.status = 'active'
    join public.workbooks w on w.id = e.workbook_id
    join auth.users u on u.id = s.user_id
    cross join lateral (
      select greatest(e.last_opened_at, coalesce((select max(p.at) from public.progress_events p where p.enrolment_id = e.id), e.last_opened_at)) as last_activity
    ) a
   where s.reminders_on
     and u.email is not null
     and not exists (select 1 from public.account_deletion_requests d
                      where d.user_id = s.user_id and d.cancelled_at is null and d.completed_at is null);
end $$;

-- Every active enrolment with its review dial (null where the reader has not
-- chosen one), for the daily candidate list. Ids and settings only.
create or replace function public.review_targets() returns table (
  enrolment_id uuid, user_id uuid, version_id uuid, safety_tier text, review_frequency text, timezone text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads review targets' using errcode = 'insufficient_privilege';
  end if;
  return query
  select e.id, e.user_id, e.version_id, w.safety_tier::text, s.review_frequency, coalesce(s.timezone, 'Europe/London')
    from public.enrolments e
    join public.workbooks w on w.id = e.workbook_id
    left join public.today_settings s on s.enrolment_id = e.id
   where e.status = 'active'
     and not exists (select 1 from public.account_deletion_requests d
                      where d.user_id = e.user_id and d.cancelled_at is null and d.completed_at is null);
end $$;

-- Stamps the stop: reminders off, with the time. Service role only.
create or replace function public.stop_reminders(p_enrolment uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role stops reminders' using errcode = 'insufficient_privilege';
  end if;
  update public.today_settings set reminders_on = false, reminders_stopped_at = now()
   where enrolment_id = p_enrolment and reminders_on;
  get diagnostics n = row_count;
  return n = 1;
end $$;

revoke execute on function public.reminder_targets(), public.review_targets(), public.stop_reminders(uuid) from public, anon, authenticated;
grant execute on function public.reminder_targets(), public.review_targets(), public.stop_reminders(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7. The calendar link (4.8). The token is made here, returned once, and only
--    its sha256 is kept. Calling again replaces the link, so the old one stops
--    working. The reader must own the enrolment.
-- ---------------------------------------------------------------------------
create or replace function public.new_calendar_token(p_enrolment uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_uid uuid := app.uid();
begin
  if v_uid is null or not app.enrolment_owner(p_enrolment) then
    raise exception 'not your programme' using errcode = 'insufficient_privilege';
  end if;
  insert into public.today_settings (enrolment_id, user_id, calendar_token_hash)
  values (p_enrolment, v_uid, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'))
  on conflict (enrolment_id) do update set calendar_token_hash = excluded.calendar_token_hash;
  return v_token;
end $$;

-- Takes the link away.
create or replace function public.clear_calendar_token(p_enrolment uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if app.uid() is null or not app.enrolment_owner(p_enrolment) then
    raise exception 'not your programme' using errcode = 'insufficient_privilege';
  end if;
  update public.today_settings set calendar_token_hash = null where enrolment_id = p_enrolment;
end $$;

-- The feed route finds the programme by hash. Service role only.
create or replace function public.calendar_feed_target(p_hash text) returns table (
  enrolment_id uuid, user_id uuid, version_id uuid, workbook_id uuid, safety_tier text, reminder_days smallint[], timezone text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads a calendar feed' using errcode = 'insufficient_privilege';
  end if;
  return query
  select s.enrolment_id, s.user_id, e.version_id, e.workbook_id, w.safety_tier::text, s.reminder_days, s.timezone
    from public.today_settings s
    join public.enrolments e on e.id = s.enrolment_id and e.status = 'active'
    join public.workbooks w on w.id = e.workbook_id
   where s.calendar_token_hash = p_hash
     and not exists (select 1 from public.account_deletion_requests d
                      where d.user_id = s.user_id and d.cancelled_at is null and d.completed_at is null);
end $$;

revoke execute on function public.new_calendar_token(uuid), public.clear_calendar_token(uuid), public.calendar_feed_target(text) from public, anon, authenticated;
grant execute on function public.new_calendar_token(uuid), public.clear_calendar_token(uuid) to authenticated;
grant execute on function public.calendar_feed_target(text) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Supabase Cron and Vault (14.8).
--
-- cron_runs logs every call a job makes. app.call_cron_route reads the base
-- URL from app_config ('cron_base_url') and CRON_SECRET from Vault
-- (vault.decrypted_secrets, secret named 'cron_secret'), then posts to the
-- route with pg_net. The secret is never written to the log or returned.
-- Vault is read only inside this function, which only the database owner
-- (and so pg_cron) can run.
--
-- To switch this on, Crent runs once in the SQL editor:
--   select vault.create_secret('<the CRON_SECRET value>', 'cron_secret');
--   update public.app_config set value = to_jsonb('https://<the site>'::text) where key = 'cron_base_url';
-- Until both are set, each run logs "skipped" and nothing is sent.
--
-- The routes are idempotent (mail claims, unique rows), so these jobs and
-- the Vercel crons in apps/web/vercel.json can run side by side.
-- ---------------------------------------------------------------------------
create table public.cron_runs (
  id          bigint generated always as identity primary key,
  job         text not null check (length(job) between 1 and 80),
  path        text not null check (length(path) between 1 and 200),
  started_at  timestamptz not null default now(),
  status      text not null default 'started' check (status in ('started','sent','skipped','error')),
  detail      text check (detail is null or length(detail) <= 200),
  request_id  bigint,
  http_status int
);
create index cron_runs_started_idx on public.cron_runs(started_at desc);

alter table public.cron_runs enable row level security;
revoke all on public.cron_runs from anon, authenticated;
grant select on public.cron_runs to authenticated, service_role;
create policy cron_runs_staff_read on public.cron_runs for select to authenticated
  using ((select app.is_staff()));

-- Fills in the HTTP status of earlier calls from pg_net's response table,
-- where pg_net exists. Quiet where it does not.
create or replace function app.cron_collect_results() returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if to_regclass('net._http_response') is null then return; end if;
  execute $q$
    update public.cron_runs c set http_status = r.status_code
      from net._http_response r
     where c.request_id = r.id and c.http_status is null and c.started_at > now() - interval '2 days'
  $q$;
exception when others then
  null;
end $$;

create or replace function app.call_cron_route(p_job text, p_path text) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_run bigint;
  v_base text;
  v_secret text;
  v_req bigint;
begin
  insert into public.cron_runs (job, path) values (p_job, p_path) returning id into v_run;
  delete from public.cron_runs where started_at < now() - interval '30 days';
  perform app.cron_collect_results();

  select nullif(trim(both '/' from coalesce(value #>> '{}', '')), '') into v_base from public.app_config where key = 'cron_base_url';
  if v_base is null then
    update public.cron_runs set status = 'skipped', detail = 'cron_base_url is not set' where id = v_run;
    return v_run;
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    update public.cron_runs set status = 'skipped', detail = 'Vault is not enabled' where id = v_run;
    return v_run;
  end if;
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'net' and p.proname = 'http_post') then
    update public.cron_runs set status = 'skipped', detail = 'pg_net is not enabled' where id = v_run;
    return v_run;
  end if;

  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into v_secret using 'cron_secret';
  if v_secret is null or v_secret = '' then
    update public.cron_runs set status = 'skipped', detail = 'no cron_secret in Vault' where id = v_run;
    return v_run;
  end if;

  execute 'select net.http_post(url := $1, headers := $2, body := $3)' into v_req
    using 'https://' || regexp_replace(v_base, '^https?://', '') || p_path,
          jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
          '{}'::jsonb;
  update public.cron_runs set status = 'sent', request_id = v_req where id = v_run;
  return v_run;
exception when others then
  -- The SQLSTATE only: a message could carry the secret.
  update public.cron_runs set status = 'error', detail = 'sqlstate ' || sqlstate where id = v_run;
  return v_run;
end $$;

revoke execute on function app.call_cron_route(text, text), app.cron_collect_results() from public, anon, authenticated;

-- The three jobs. Guarded: where an extension cannot be enabled (a plain
-- Postgres test database, or a project without it) the block says so and
-- the rest of the migration stands.
do $$
declare
  v_ok boolean := true;
  v_def record;
begin
  begin create extension if not exists pg_cron; exception when others then
    v_ok := false; raise notice '0040: pg_cron could not be enabled (%). The jobs were not scheduled; enable it and re-run the schedule statements in docs/CRON.md.', sqlstate;
  end;
  begin create extension if not exists pg_net; exception when others then
    raise notice '0040: pg_net could not be enabled (%). Jobs will log "skipped" until it is.', sqlstate;
  end;
  begin create extension if not exists supabase_vault; exception when others then
    raise notice '0040: Vault could not be enabled (%). Jobs will log "skipped" until it is.', sqlstate;
  end;

  if v_ok and to_regnamespace('cron') is not null then
    for v_def in select * from (values
      ('akana-today-reminders',  '*/15 * * * *', 'today-reminders',  '/api/today/reminders'),
      ('akana-review-candidates', '5 3 * * *',   'review-candidates', '/api/today/review-candidates'),
      ('akana-pickup-check',     '20 9 * * *',   'pickup-check',     '/api/today/pickup')
    ) as t(jobname, schedule, job, path) loop
      -- cron.schedule with an existing name replaces it, so this can be re-run.
      execute format('select cron.schedule(%L, %L, %L)', v_def.jobname, v_def.schedule,
                     format('select app.call_cron_route(%L, %L)', v_def.job, v_def.path));
    end loop;
    raise notice '0040: three pg_cron jobs scheduled.';
  else
    raise notice '0040: pg_cron is not present, so no jobs were scheduled.';
  end if;
exception when others then
  raise notice '0040: job scheduling skipped (sqlstate %).', sqlstate;
end $$;
