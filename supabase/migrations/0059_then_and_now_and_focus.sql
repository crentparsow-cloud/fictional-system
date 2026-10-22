-- 0059 "Then and now" check-ins (build list 3.10) and focus mode settings (3.11).
--
-- Then and now: before a step the reader may tap how they are arriving, on a
-- five point scale. The tap, and the title of the step it was taken before,
-- are sealed with the answer key ring. The row holds the step ref (an
-- exercise id, never free text) and the time. It is a feeling, so it is never
-- counted, never sent anywhere and never used for a streak. A reader reads
-- and deletes their own entries; staff have no clause. Writes go through the
-- server route, as for answers. Entries go with the enrolment and the account.
--
-- Focus mode: the reading settings row gains two choices, "focus" (paragraph
-- dimming, typewriter centring, both or neither) and "thennow" (whether the
-- one tap check-in is offered). Both are optional keys with fixed values. The
-- shape check from 0044 is replaced by one that knows them.

create table if not exists public.then_now_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  enrolment_id uuid not null references public.enrolments(id) on delete cascade,
  step_ref     text not null check (step_ref ~ '^[a-z0-9][a-z0-9_:~.-]{0,79}$'),
  sealed       text not null check (sealed ~ '^v[12]\.'),
  key_id       text not null check (length(key_id) between 1 and 32),
  taken_at     timestamptz not null default now()
);
create index if not exists then_now_entries_user_idx on public.then_now_entries(user_id, taken_at desc);
create index if not exists then_now_entries_enrolment_idx on public.then_now_entries(enrolment_id);

create or replace function app.guard_then_now_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.enrolments e where e.id = new.enrolment_id and e.user_id = new.user_id) then
    raise exception 'an entry must belong to the owner of its enrolment' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
drop trigger if exists then_now_owner_guard on public.then_now_entries;
create trigger then_now_owner_guard before insert on public.then_now_entries
  for each row execute function app.guard_then_now_owner();

alter table public.then_now_entries enable row level security;
revoke all on public.then_now_entries from public, anon, authenticated;
grant select, delete on public.then_now_entries to authenticated;
grant select, insert, delete on public.then_now_entries to service_role;

drop policy if exists then_now_read on public.then_now_entries;
create policy then_now_read on public.then_now_entries for select to authenticated
  using (user_id = (select app.uid()));
drop policy if exists then_now_delete on public.then_now_entries;
create policy then_now_delete on public.then_now_entries for delete to authenticated
  using (user_id = (select app.uid()));

-- Reading settings: add focus and thennow to the allowed keys.
alter table public.reader_settings drop constraint if exists reader_settings_reading_shape;
alter table public.reader_settings add constraint reader_settings_reading_shape check (
  jsonb_typeof(reading) = 'object'
  and (reading - array['font', 'size', 'colour', 'margin', 'progress', 'focus', 'thennow']) = '{}'::jsonb
  and (not (reading ? 'font') or reading ->> 'font' in ('atkinson', 'lexend', 'dyslexic', 'serif'))
  and (not (reading ? 'size') or (jsonb_typeof(reading -> 'size') = 'number' and reading ->> 'size' in ('0', '1', '2', '3', '4', '5')))
  and (not (reading ? 'colour') or reading ->> 'colour' in ('auto', 'light', 'dark'))
  and (not (reading ? 'margin') or reading ->> 'margin' in ('narrow', 'standard', 'wide'))
  and (not (reading ? 'progress') or reading ->> 'progress' in ('both', 'time', 'none'))
  and (not (reading ? 'focus') or reading ->> 'focus' in ('off', 'dim', 'typewriter', 'both'))
  and (not (reading ? 'thennow') or reading ->> 'thennow' in ('off', 'on'))
);
