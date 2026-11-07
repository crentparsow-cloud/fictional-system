-- 0071 Progress events: one-off kinds are stored once, repeating kinds are not
-- limited, and ownership still holds. Each block must raise or return the
-- expected count; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a7100000-0000-0000-0000-000000000001', 'reader71a@test'),
  ('a7100000-0000-0000-0000-000000000002', 'reader71b@test');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, connect_status) values
  ('a7100000-0000-0000-0000-0000000000a1', 'PB-TST71', 'publisher', 'Org 71 Ltd', 'Org 71', 'org-71', 'GB', 'verified');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a7100000-0000-0000-0000-0000000000b1', 'a7100000-0000-0000-0000-0000000000a1', 'book-71', 'Book 71', 'public_domain');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, safety_tier, depth, status) values
  ('a7100000-0000-0000-0000-0000000000c1', 'AK-T71A0', 'a7100000-0000-0000-0000-0000000000b1', 'a7100000-0000-0000-0000-0000000000a1',
   'wb-71', 'Workbook 71', 'Card', 'productivity', 'none', 'full', 'live');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a7100000-0000-0000-0000-0000000000d1', 'a7100000-0000-0000-0000-0000000000c1', '1.0.0', '{"structure":{"unit":"week","count":4}}'::jsonb, repeat('a', 64));
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('a7100000-0000-0000-0000-0000000000e1', 'a7100000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'a7100000-0000-0000-0000-0000000000c1', 'a7100000-0000-0000-0000-0000000000d1'),
  ('a7100000-0000-0000-0000-0000000000e2', 'a7100000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a',
   'a7100000-0000-0000-0000-0000000000c1', 'a7100000-0000-0000-0000-0000000000d1');

-- ---------------------------------------------------------------------------
-- 1. The clean-up step keeps the earliest row. Rehearse it on a copy of the
--    index-less state: drop the index, add repeats, run the same delete.
-- ---------------------------------------------------------------------------
drop index public.progress_events_once_idx;
insert into public.progress_events (enrolment_id, kind, ref, at) values
  ('a7100000-0000-0000-0000-0000000000e2', 'step_done', 's1', now() - interval '2 days'),
  ('a7100000-0000-0000-0000-0000000000e2', 'step_done', 's1', now() - interval '1 day'),
  ('a7100000-0000-0000-0000-0000000000e2', 'finished', null, now() - interval '2 days'),
  ('a7100000-0000-0000-0000-0000000000e2', 'finished', null, now() - interval '1 day'),
  ('a7100000-0000-0000-0000-0000000000e2', 'toolkit_used', 't1', now() - interval '2 days'),
  ('a7100000-0000-0000-0000-0000000000e2', 'toolkit_used', 't1', now() - interval '1 day');
delete from public.progress_events p
 using (select id, row_number() over (partition by enrolment_id, kind, coalesce(ref, '') order by at, id) as rn
          from public.progress_events where kind in ('unit_opened', 'step_done', 'checkin_done', 'finished')) d
 where p.id = d.id and d.rn > 1;
do $$ begin
  if (select count(*) from public.progress_events where enrolment_id = 'a7100000-0000-0000-0000-0000000000e2' and kind = 'step_done') <> 1 then
    raise exception 'clean-up left repeated step_done rows';
  end if;
  if (select count(*) from public.progress_events where enrolment_id = 'a7100000-0000-0000-0000-0000000000e2' and kind = 'finished') <> 1 then
    raise exception 'clean-up left repeated finished rows';
  end if;
  if (select count(*) from public.progress_events where enrolment_id = 'a7100000-0000-0000-0000-0000000000e2' and kind = 'toolkit_used') <> 2 then
    raise exception 'clean-up touched toolkit_used';
  end if;
  if (select min(at) from public.progress_events where enrolment_id = 'a7100000-0000-0000-0000-0000000000e2' and kind = 'step_done') > now() - interval '36 hours' then
    raise exception 'clean-up did not keep the earliest row';
  end if;
end $$;
delete from public.progress_events where enrolment_id = 'a7100000-0000-0000-0000-0000000000e2';
create unique index progress_events_once_idx
  on public.progress_events (enrolment_id, kind, coalesce(ref, ''))
  where kind in ('unit_opened', 'step_done', 'checkin_done', 'finished');

-- ---------------------------------------------------------------------------
-- 2. A reader writes as themselves
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
select test_as('a7100000-0000-0000-0000-000000000001');
do $$
declare k text;
begin
  -- One-off kinds: the second insert is refused with a unique violation.
  foreach k in array array['unit_opened', 'step_done', 'checkin_done'] loop
    insert into public.progress_events (enrolment_id, kind, ref) values ('a7100000-0000-0000-0000-0000000000e1', k, '1');
    begin
      insert into public.progress_events (enrolment_id, kind, ref) values ('a7100000-0000-0000-0000-0000000000e1', k, '1');
      raise exception 'a repeated % was stored', k;
    exception when unique_violation then null; end;
    -- A different ref is a different fact.
    insert into public.progress_events (enrolment_id, kind, ref) values ('a7100000-0000-0000-0000-0000000000e1', k, '2');
  end loop;

  -- finished has no ref: still once.
  insert into public.progress_events (enrolment_id, kind) values ('a7100000-0000-0000-0000-0000000000e1', 'finished');
  begin
    insert into public.progress_events (enrolment_id, kind) values ('a7100000-0000-0000-0000-0000000000e1', 'finished');
    raise exception 'a repeated finished was stored';
  exception when unique_violation then null; end;

  -- on conflict do nothing leaves exactly one row.
  insert into public.progress_events (enrolment_id, kind, ref) values ('a7100000-0000-0000-0000-0000000000e1', 'step_done', '1')
    on conflict do nothing;
  if (select count(*) from public.progress_events where enrolment_id = 'a7100000-0000-0000-0000-0000000000e1' and kind = 'step_done' and ref = '1') <> 1 then
    raise exception 'step_done 1 should exist once';
  end if;

  -- Repeating kinds are not limited.
  insert into public.progress_events (enrolment_id, kind, ref) values ('a7100000-0000-0000-0000-0000000000e1', 'toolkit_used', 't1');
  insert into public.progress_events (enrolment_id, kind, ref) values ('a7100000-0000-0000-0000-0000000000e1', 'toolkit_used', 't1');
  if (select count(*) from public.progress_events where enrolment_id = 'a7100000-0000-0000-0000-0000000000e1' and kind = 'toolkit_used') <> 2 then
    raise exception 'toolkit_used should repeat';
  end if;
  insert into public.progress_events (enrolment_id, kind) values ('a7100000-0000-0000-0000-0000000000e1', 'daily_check_done');
  insert into public.progress_events (enrolment_id, kind) values ('a7100000-0000-0000-0000-0000000000e1', 'daily_check_done');
  if (select count(*) from public.progress_events where enrolment_id = 'a7100000-0000-0000-0000-0000000000e1' and kind = 'daily_check_done') <> 2 then
    raise exception 'daily_check_done should repeat';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. The ownership rule still holds
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
select test_as('a7100000-0000-0000-0000-000000000001');
do $$ begin
  begin
    insert into public.progress_events (enrolment_id, kind, ref) values ('a7100000-0000-0000-0000-0000000000e2', 'step_done', 'other');
    raise exception 'a reader wrote progress for another reader''s enrolment';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- The same key on two enrolments is two facts.
do $$ begin
  insert into public.progress_events (enrolment_id, kind, ref) values ('a7100000-0000-0000-0000-0000000000e2', 'step_done', '1');
end $$;

rollback;
