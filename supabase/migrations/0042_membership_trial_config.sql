-- 0042 Membership trial lengths (13.5).
--
-- The membership trial is 14 days on the monthly plan and 21 days on the
-- annual plan, card required. The lengths are settings, not code: they live
-- in public.app_config next to the grace period (0010) and are read by
-- apps/web/lib/membership-trial-server.ts. A value of 0 switches the trial
-- off for that plan. The app accepts whole numbers from 0 to 60 and falls
-- back to 14 and 21 for anything else, or when a row is missing.
--
-- app_config is readable by everyone (0001), so the offer screen, the
-- checkout and the reminder email all read the same figure. Only staff with
-- the owner role can change it. Additive and idempotent: a value Crent has
-- already set is left alone.
insert into public.app_config (key, value) values
  ('membership_trial_days_monthly', '14'),
  ('membership_trial_days_yearly', '21')
on conflict (key) do nothing;
