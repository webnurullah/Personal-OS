-- Course notes stay private and simple: a text editor (it stores its text as HTML) and nothing else.
-- The "public link" parts of 20261018000000_course_notes.sql were switched off before anyone used them:
--   * public_course_notes() returns nothing and nobody may call it,
--   * the link code `notes_share` can no longer be set (it is always empty) and nothing in the app reads it.
-- (The unused column and function are left in place; removing them is only a clean-up.)
-- Safe to run again.

create or replace function public.public_course_notes(p_token uuid)
returns table (title text, notes text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select null::text, null::text, null::timestamptz where false
$$;

revoke execute on function public.public_course_notes(uuid) from anon, authenticated;

create or replace function public.course_share_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.notes_share := null;
  return new;
end $$;

-- The editor's HTML is longer than plain text: room for about 100,000 letters.
alter table public.courses drop constraint if exists courses_notes_check;
alter table public.courses drop constraint if exists courses_notes_limit;
alter table public.courses add constraint courses_notes_limit check (char_length(notes) <= 100000);
