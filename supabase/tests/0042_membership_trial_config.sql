-- Membership trial config (0042): both lengths are seeded, readable by
-- anonymous visitors, not writable by them, and a second run changes nothing.
-- Each block must raise or return the expected count; a failure aborts the
-- script and the CI step.
\set ON_ERROR_STOP on

begin;

do $$
declare monthly text; yearly text;
begin
  select value #>> '{}' into monthly from public.app_config where key = 'membership_trial_days_monthly';
  select value #>> '{}' into yearly from public.app_config where key = 'membership_trial_days_yearly';
  if monthly is distinct from '14' then raise exception 'monthly trial default is %, expected 14', monthly; end if;
  if yearly is distinct from '21' then raise exception 'yearly trial default is %, expected 21', yearly; end if;
end $$;

-- A value set by hand survives the migration being applied again.
update public.app_config set value = '10' where key = 'membership_trial_days_monthly';
insert into public.app_config (key, value) values
  ('membership_trial_days_monthly', '14'),
  ('membership_trial_days_yearly', '21')
on conflict (key) do nothing;
do $$
begin
  if (select value #>> '{}' from public.app_config where key = 'membership_trial_days_monthly') is distinct from '10' then
    raise exception 'a re-run overwrote the monthly trial length';
  end if;
end $$;

-- Anonymous visitors can read it and cannot change it.
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public.app_config where key like 'membership_trial_days_%';
  if n <> 2 then raise exception 'anon should read 2 trial rows, saw %', n; end if;
  begin
    update public.app_config set value = '0' where key = 'membership_trial_days_yearly';
    raise exception 'anon was able to write app_config';
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;

rollback;
