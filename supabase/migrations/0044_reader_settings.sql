-- 0044 Reading settings on the account (build list 3.5 to 3.7, the Aa panel).
--
-- One row per reader holding the reading settings: font, text size, page
-- colour, margin width and how progress is shown. They follow the reader from
-- device to device. The device keeps its own copy as the fallback, and the
-- newer of the two wins (apps/web/lib/reading/settings.ts).
--
-- The row holds choices from fixed lists, never text the reader typed, and
-- nothing about their answers. The check constraint is the whole schema: any
-- other key, or any value outside its list, is refused by the database.
-- A reader reads and writes only their own row. Deleting the account deletes
-- the row. The service role is not given access: no job needs it.

create table public.reader_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  reading    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint reader_settings_reading_shape check (
    jsonb_typeof(reading) = 'object'
    and (reading - array['font', 'size', 'colour', 'margin', 'progress']) = '{}'::jsonb
    and (not (reading ? 'font') or reading ->> 'font' in ('atkinson', 'lexend', 'dyslexic', 'serif'))
    and (not (reading ? 'size') or (jsonb_typeof(reading -> 'size') = 'number' and reading ->> 'size' in ('0', '1', '2', '3', '4', '5')))
    and (not (reading ? 'colour') or reading ->> 'colour' in ('auto', 'light', 'dark'))
    and (not (reading ? 'margin') or reading ->> 'margin' in ('narrow', 'standard', 'wide'))
    and (not (reading ? 'progress') or reading ->> 'progress' in ('both', 'time', 'none'))
  )
);

alter table public.reader_settings enable row level security;
revoke all on public.reader_settings from public, anon, authenticated;
grant select, insert, update on public.reader_settings to authenticated;

create policy reader_settings_read on public.reader_settings for select to authenticated
  using (user_id = (select app.uid()));
create policy reader_settings_insert on public.reader_settings for insert to authenticated
  with check (user_id = (select app.uid()));
create policy reader_settings_update on public.reader_settings for update to authenticated
  using (user_id = (select app.uid()))
  with check (user_id = (select app.uid()));
