-- 0077 Integration of the November 2026 review fixes (0074, 0075, 0076).
--
-- 0074 revoked the default client privileges on every sequence in public.
-- 0075 and 0076 were written beside it and add tables with identity columns,
-- so their sequences came with the default again. This repeats the revoke
-- after them. No client inserts into those tables: they are written by
-- security definer functions and the service role.
--
-- Safe to run twice. Depends on 0074 to 0076 only for the objects they made.
revoke all on all sequences in schema public from public, anon, authenticated;
