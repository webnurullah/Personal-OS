-- Indexes for foreign keys (Supabase performance advisor: "Unindexed foreign keys").
-- The user_id ones also speed up Row Level Security, which filters every query by user_id.
create index if not exists bills_budget_category_idx on public.bills (budget_category_id);
create index if not exists bills_transaction_idx on public.bills (transaction_id);
create index if not exists course_topics_unit_idx on public.course_topics (unit_id);
create index if not exists course_topics_user_idx on public.course_topics (user_id);
create index if not exists course_units_user_idx on public.course_units (user_id);
create index if not exists courses_user_idx on public.courses (user_id);
create index if not exists events_category_idx on public.events (category_id);
create index if not exists goal_milestones_user_idx on public.goal_milestones (user_id);
create index if not exists goals_category_idx on public.goals (category_id);
create index if not exists goals_user_idx on public.goals (user_id);
create index if not exists habits_user_idx on public.habits (user_id);
create index if not exists notes_user_idx on public.notes (user_id);
create index if not exists reminders_user_idx on public.reminders (user_id);
create index if not exists tasks_category_idx on public.tasks (category_id);
create index if not exists transactions_budget_category_idx on public.transactions (budget_category_id);
