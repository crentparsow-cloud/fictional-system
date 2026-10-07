-- 0006 Health data consent (F-026).
--
-- Same rules as 0001 to 0005. Helpers are security definer with search_path
-- pinned. PostgREST exposes the public schema only, so each app function has
-- a thin public wrapper that runs as the caller.
--
-- The shape of trust here:
--   * What a reader writes in a wellbeing workbook (safety_tier standard or
--     higher) may be health data. Before the first one opens, the reader gives
--     explicit consent to store it. The time and the wording version are kept
--     on their own profile row.
--   * Only the two functions below change these columns, and only for
--     app.uid(). A direct client update of either column is refused, so the
--     version always comes through one checked path.
--   * Withdrawal clears both columns. The answers route then refuses new saves
--     for wellbeing workbooks until consent is given again. Nothing already
--     written is deleted here; deletion is the reader's separate choice.
--   * The reader reads their own values under the existing profiles_own
--     policy from 0001. Staff do not read profiles directly.
--
-- The append-only consent history (consent_versions and consents in the
-- architecture) is a later migration. These columns hold the current state.

alter table public.profiles
  add column health_consent_at      timestamptz,
  add column health_consent_version text check (health_consent_version is null or health_consent_version ~ '^[a-z0-9][a-z0-9._-]{0,31}$'),
  add constraint profiles_health_consent_pair check ((health_consent_at is null) = (health_consent_version is null));

-- ---------------------------------------------------------------------------
-- Guard: a client may not write the consent columns directly. Runs as the
-- caller, so the security definer functions below (which run as the owner)
-- pass, as does server code on the service role.
-- ---------------------------------------------------------------------------
create or replace function app.guard_health_consent() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.health_consent_at      is distinct from (case when tg_op = 'UPDATE' then old.health_consent_at end)
    or new.health_consent_version is distinct from (case when tg_op = 'UPDATE' then old.health_consent_version end)) then
    raise exception 'health consent changes only through app.set_health_consent or app.clear_health_consent'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger profiles_health_consent_guard before insert or update on public.profiles
  for each row execute function app.guard_health_consent();

-- ---------------------------------------------------------------------------
-- Give consent, for the signed-in reader only. Returns the time recorded.
-- Giving it again with a new version moves both columns forward.
-- ---------------------------------------------------------------------------
create or replace function app.set_health_consent(p_version text) returns timestamptz
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := app.uid();
  v_at  timestamptz := now();
begin
  if v_uid is null then
    raise exception 'sign in to give consent' using errcode = 'insufficient_privilege';
  end if;
  if p_version is null or p_version !~ '^[a-z0-9][a-z0-9._-]{0,31}$' then
    raise exception 'unknown consent version' using errcode = 'check_violation';
  end if;
  insert into public.profiles (user_id, health_consent_at, health_consent_version)
  values (v_uid, v_at, p_version)
  on conflict (user_id) do update
    set health_consent_at = excluded.health_consent_at,
        health_consent_version = excluded.health_consent_version;
  return v_at;
end $$;

-- ---------------------------------------------------------------------------
-- Withdraw consent, for the signed-in reader only.
-- ---------------------------------------------------------------------------
create or replace function app.clear_health_consent() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := app.uid();
begin
  if v_uid is null then
    raise exception 'sign in to withdraw consent' using errcode = 'insufficient_privilege';
  end if;
  update public.profiles
     set health_consent_at = null, health_consent_version = null
   where user_id = v_uid;
end $$;

-- RPC wrappers. Security invoker: the app functions do the checks.
create or replace function public.set_health_consent(p_version text) returns timestamptz
language sql volatile security invoker set search_path = '' as $$
  select app.set_health_consent(p_version)
$$;
create or replace function public.clear_health_consent() returns void
language sql volatile security invoker set search_path = '' as $$
  select app.clear_health_consent()
$$;

revoke execute on function app.set_health_consent(text), app.clear_health_consent() from public, anon;
revoke execute on function public.set_health_consent(text), public.clear_health_consent() from public, anon;
grant execute on function app.set_health_consent(text), app.clear_health_consent() to authenticated;
grant execute on function public.set_health_consent(text), public.clear_health_consent() to authenticated;
