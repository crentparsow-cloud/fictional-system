-- DEMO PERIOD OFF. Not a migration. Do not apply from here.
--
-- Copy this into the next numbered migration at launch (for example
-- 00NN_demo_period_off.sql) and apply it through the normal migration route.
-- It makes app.demo_fully_open() return false, so demo titles show only their
-- free first part again and app.demo_open_to_reader() is false for everyone.
-- workbook_sections_read needs no change: its demo branch calls the switch.
--
-- Do these in the same release (see docs/planning/AK_Phase_B_Review_List.md,
-- "Demo period switches to reverse before launch"):
--   1. apps/web/lib/demo-period.ts: demoFullyOpen() returns false.
--   2. Update apps/web/lib/demo-period.test.ts to expect false.
--   3. Add a database test with the new migration's number that expects
--      app.demo_fully_open() = false and a signed-in reader with no purchase
--      seeing only the free first part of a demo. supabase/tests/0070 asserts
--      the open state, so its demo-open cases will fail once this is applied;
--      change them in the same commit.

create or replace function app.demo_fully_open() returns boolean
language sql immutable security definer set search_path = '' as $$
  select false
$$;

revoke execute on function app.demo_fully_open() from public;
grant execute on function app.demo_fully_open() to anon, authenticated, service_role;
