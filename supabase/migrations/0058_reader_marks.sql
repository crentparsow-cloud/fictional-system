-- 0058 Highlights and notes (build list 3.4, marginalia).
--
-- A reader marks a paragraph with one of five marker colours and may add a
-- note. The paragraph is named by a ref (the screen and the paragraph number
-- on it). The words of the note, and the words of the paragraph kept for the
-- Markdown export, are sealed together with the same key ring as answers, so
-- the database holds the colour and the place and nothing readable.
--
-- Private to the reader. Only the owner can read a row, and that includes
-- staff: there is no staff clause on purpose. Clients can read and delete
-- their own marks. They cannot insert or update: the only write path is the
-- server route, which checks the session and the enrolment, seals the text,
-- then writes with the service role (the same shape as public.answers).
-- A mark goes when its enrolment goes, and when the account goes.

create table if not exists public.reader_marks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  enrolment_id uuid not null references public.enrolments(id) on delete cascade,
  ref          text not null check (ref ~ '^[a-z0-9][a-z0-9_:~.#-]{0,119}$'),
  colour       text not null check (colour in ('yellow', 'green', 'pink', 'blue', 'orange')),
  sealed       text not null check (sealed ~ '^v[12]\.'),
  key_id       text not null check (length(key_id) between 1 and 32),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (enrolment_id, ref)
);
create index if not exists reader_marks_user_idx on public.reader_marks(user_id);

-- A mark belongs to the person who owns the enrolment. The service role
-- bypasses row level security, so the table checks it for itself.
create or replace function app.guard_reader_mark_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.enrolments e where e.id = new.enrolment_id and e.user_id = new.user_id) then
    raise exception 'a mark must belong to the owner of its enrolment' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.enrolment_id is distinct from old.enrolment_id) then
    raise exception 'a mark keeps its owner and enrolment' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
drop trigger if exists reader_marks_owner_guard on public.reader_marks;
create trigger reader_marks_owner_guard before insert or update on public.reader_marks
  for each row execute function app.guard_reader_mark_owner();

alter table public.reader_marks enable row level security;
revoke all on public.reader_marks from public, anon, authenticated;
grant select, delete on public.reader_marks to authenticated;
grant select, insert, update, delete on public.reader_marks to service_role;

drop policy if exists reader_marks_read on public.reader_marks;
create policy reader_marks_read on public.reader_marks for select to authenticated
  using (user_id = (select app.uid()));
drop policy if exists reader_marks_delete on public.reader_marks;
create policy reader_marks_delete on public.reader_marks for delete to authenticated
  using (user_id = (select app.uid()));
