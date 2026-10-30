-- 0070 Demo titles fully open to signed-in readers for the demo period
-- (decided by Crent, 30 October 2026).
--
-- Same rules as 0001 to 0069. Nothing earlier is edited. Functions are
-- security definer with search_path pinned to ''. Safe to run twice.
--
-- The unit gate lives in the workbook_sections_read policy (0004): a section
-- opens when it is free on a public title, when the reader can manage the
-- workbook, or when app.has_entitlement says yes. Until now Part 2 onward of
-- a demo title stayed closed, and the reader saw "Demo titles cannot be
-- bought". For the demo period every section of a public demo title opens to
-- any signed-in reader, with no purchase or membership.
--
-- What does not change: anonymous readers still see only the listing, start
-- and the free first part (the try page). Demo titles stay unbuyable: the
-- 0004 purchase guard and the checkout refusal are untouched. A demo hidden
-- by the demo_visible flag stays hidden, because the new branch also asks
-- app.workbook_is_public. app.has_entitlement is not changed, so nothing that
-- reads entitlements (takedowns, dashboards) starts treating demos as bought.
--
-- To reverse before launch: make app.demo_fully_open() return false (or drop
-- the branch from the policy). The app mirror is demoFullyOpen() in
-- apps/web/lib/demo-period.ts. Both are listed in
-- docs/planning/AK_Phase_B_Review_List.md under "Demo period switches to
-- reverse before launch".
--
-- 1. app.demo_fully_open: the one switch
-- 2. app.demo_open_to_reader: is this a public demo and is someone signed in
-- 3. workbook_sections_read redefined with the demo branch

-- ---------------------------------------------------------------------------
-- 1. The switch. Demo period, remove before launch.
-- ---------------------------------------------------------------------------
create or replace function app.demo_fully_open() returns boolean
language sql immutable security definer set search_path = '' as $$
  -- demo period, remove before launch
  select true
$$;

-- ---------------------------------------------------------------------------
-- 2. A signed-in reader may read every section of a public demo title while
-- the switch is on. False for anonymous callers, real titles, hidden or
-- unpublished demos, and an unknown workbook.
-- ---------------------------------------------------------------------------
create or replace function app.demo_open_to_reader(p_workbook uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.demo_fully_open()
     and app.uid() is not null
     and exists (select 1 from public.workbooks w where w.id = p_workbook and w.is_demo)
     and app.workbook_is_public(p_workbook)
$$;

revoke execute on function app.demo_fully_open(), app.demo_open_to_reader(uuid) from public;
grant execute on function app.demo_fully_open(), app.demo_open_to_reader(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The section read: the 0004 branches unchanged, plus the demo branch.
-- ---------------------------------------------------------------------------
drop policy if exists workbook_sections_read on public.workbook_sections;
create policy workbook_sections_read on public.workbook_sections for select to anon, authenticated
  using (
    ((kind = 'listing' or free) and (select app.workbook_is_public(app.version_workbook(version_id))))
    or (select app.can_read_workbook(app.version_workbook(version_id)))
    or (select app.has_entitlement(app.uid(), app.version_tenant(version_id), app.version_workbook(version_id), unit_number))
    or (select app.demo_open_to_reader(app.version_workbook(version_id)))
  );
