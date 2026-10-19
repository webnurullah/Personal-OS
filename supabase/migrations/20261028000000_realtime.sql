-- Real-time sync: a change made on one device shows on the others without a reload.
-- The tables of the app join Supabase's "supabase_realtime" publication; the browser listens and reloads the screens that show them.
-- Row level security still decides who receives what. google_connections (the Google token) is never published.
-- Safe to run again.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return; -- not a Supabase database (local test): nothing to do
  end if;
  foreach t in array array[
    'archive_items', 'bills', 'budget_categories', 'categories', 'companies', 'course_time', 'course_topics', 'course_units', 'courses',
    'events', 'goal_milestones', 'goals', 'habit_logs', 'habit_sources', 'habits', 'health_logs', 'job_applications', 'learning_resources',
    'notes', 'profiles', 'project_time', 'projects', 'reminders', 'study_blocks', 'study_weeks', 'tasks', 'transactions'
  ] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
