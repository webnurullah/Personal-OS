-- Fixes for Supabase's security advisor (Database → Advisors → Security).
-- Run this once in Supabase → SQL Editor (after the earlier files).

-- 1. The "last edited" trigger function gets a fixed search path (lint 0011).
alter function public.set_updated_at() set search_path = '';

-- 2. The sign-up function runs by itself when an account is created (a trigger on auth.users).
--    Nobody needs to call it through the API, so only the database owner may (lints 0028 / 0029).
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 3. Same for Supabase's "auto-enable RLS" helper, when the project has it: it only runs
--    as an event trigger when a table is created, so it keeps working.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
