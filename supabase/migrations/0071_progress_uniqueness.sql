-- 0071 Progress events: one-off facts are stored once.
-- unit_opened (ref is the unit number), step_done (ref is the step id),
-- checkin_done (ref is the unit number) and finished (no ref) are facts that
-- happen once per enrolment. A retry from the device queue, a double tap or a
-- second tab must not store them twice. toolkit_used repeats by design, and
-- daily_check_done carries no ref (the day comes from the row time), so both
-- stay outside the index.
-- The route treats a unique violation as success (see api/progress/route.ts).
-- Idempotent: the clean-up finds nothing on a second run and the index is
-- created only if absent.

-- 1. Remove existing repeats, keeping the earliest row of each key.
delete from public.progress_events p
 using (
   select id,
          row_number() over (
            partition by enrolment_id, kind, coalesce(ref, '')
            order by at, id
          ) as rn
     from public.progress_events
    where kind in ('unit_opened', 'step_done', 'checkin_done', 'finished')
 ) d
 where p.id = d.id and d.rn > 1;

-- 2. The index.
create unique index if not exists progress_events_once_idx
  on public.progress_events (enrolment_id, kind, coalesce(ref, ''))
  where kind in ('unit_opened', 'step_done', 'checkin_done', 'finished');
