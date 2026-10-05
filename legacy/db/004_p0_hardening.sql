-- 004: P0 hardening found while checking the review list against the live database (1 October 2026).

-- TRUNCATE ignores row-level security. PostgREST does not expose it, but no client role needs it,
-- nor TRIGGER or REFERENCES. Remove all three from every public table.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Deletion goes only through the app function (/app/account op=delete), which cancels billing
-- first and schedules the deletion. A row inserted straight from the browser skipped both.
drop policy if exists "request own deletion" on public.deletion_requests;
revoke insert, update, delete on public.deletion_requests from anon, authenticated;
