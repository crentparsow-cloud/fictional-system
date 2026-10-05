-- 006: daily checks and self-check results are now sealed and go only through the answers
-- function (ops save_daily, load_daily, save_selfcheck, load_selfcheck). Applied 1 October 2026,
-- after the answers function (v4) was deployed and every older plain row was sealed (1 daily
-- check and 2 self-check results, via op reseal_legacy).
drop policy if exists "own rows" on public.daily_checks;
drop policy if exists "own rows" on public.selfcheck_results;
revoke all on public.daily_checks, public.selfcheck_results from anon, authenticated;
