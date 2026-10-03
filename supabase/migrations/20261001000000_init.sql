-- =====================================================================
-- Nurullah POS — database schema
-- Run this once in Supabase: Dashboard → SQL Editor → New query → Run.
--
-- Every table has a user_id and Row Level Security (RLS): a signed-in
-- user can only read and change their own rows, even if the API has a bug.
-- Dates are plain `date` values in the user's own time zone (Asia/Dhaka by
-- default); the API works out "today" before it reads or writes them.
-- =====================================================================

-- ---------- Shared helpers ----------

-- Colours the app knows how to draw. Anything else is rejected.
create domain public.color_name as text
  check (value in ('white', 'slate', 'blue', 'sky', 'cyan', 'teal', 'emerald', 'lime',
                   'yellow', 'amber', 'orange', 'rose', 'pink', 'violet', 'indigo'));

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Profile & settings (one row per user) ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  tagline text not null default 'A better you, every day',
  city text not null default '',
  timezone text not null default 'Asia/Dhaka',
  currency text not null default 'BDT' check (currency in ('BDT', 'USD')),
  week_start smallint not null default 1 check (week_start between 0 and 6), -- 0 Sunday, 1 Monday, 6 Saturday
  time_format text not null default '12h' check (time_format in ('12h', '24h')),
  hide_amounts boolean not null default false,
  weekly_study_goal numeric(5, 2) not null default 8 check (weekly_study_goal > 0),
  step_goal integer not null default 10000 check (step_goal > 0),
  sleep_goal_minutes integer not null default 480 check (sleep_goal_minutes > 0),
  water_goal integer not null default 8 check (water_goal > 0),
  notify jsonb not null default '{"morning_plan": true, "habit_reminder": true, "bills_due": true, "study_sessions": true, "weekly_review": false}',
  notifications_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Categories (tasks, events, goals) ----------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color public.color_name not null default 'slate',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------- Tasks ----------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  category_id uuid references public.categories (id) on delete set null,
  due_date date,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  notes text not null default '',
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_due_idx on public.tasks (user_id, due_date);
create index tasks_user_done_idx on public.tasks (user_id, done_at);

-- ---------- Calendar events ----------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  event_date date not null,                -- first (or only) day
  all_day boolean not null default false,
  start_time time,
  end_time time,
  repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekly')),
  repeat_until date,
  category_id uuid references public.categories (id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (all_day or (start_time is not null and end_time is not null and end_time > start_time)),
  check (repeat_until is null or repeat_until >= event_date)
);
create index events_user_date_idx on public.events (user_id, event_date);

-- ---------- Goals ----------

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  category_id uuid references public.categories (id) on delete set null,
  icon text not null default 'target',
  color public.color_name not null default 'blue',
  status text not null default 'on-track' check (status in ('on-track', 'behind', 'completed')),
  progress_mode text not null default 'value' check (progress_mode in ('value', 'milestones')),
  current_value numeric(14, 2) not null default 0 check (current_value >= 0),
  target_value numeric(14, 2) not null default 1 check (target_value > 0),
  unit text not null default '',
  deadline date,
  note text not null default '',
  completed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goal_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  at_value numeric(14, 2),               -- set: ticks itself when the goal reaches this value
  done boolean not null default false,   -- used when at_value is empty
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index goal_milestones_goal_idx on public.goal_milestones (goal_id);

-- ---------- Habits ----------

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  goal_text text not null default '',
  icon text not null default 'circle-check',
  color public.color_name not null default 'emerald',
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- One row = the habit was done on that day.
create table public.habit_logs (
  habit_id uuid not null references public.habits (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, log_date)
);
create index habit_logs_user_date_idx on public.habit_logs (user_id, log_date);

-- ---------- Learning: weekly study plan ----------

-- Optional per-week settings; without a row the profile's weekly_study_goal is used.
create table public.study_weeks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1), -- always a Monday
  topic text not null default '',
  goal_hours numeric(5, 2) check (goal_hours > 0),
  primary key (user_id, week_start)
);

create table public.study_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  weekday smallint not null check (weekday between 0 and 6),   -- 0 Monday … 6 Sunday
  hours numeric(4, 2) not null check (hours > 0 and hours <= 24),
  activity text not null check (char_length(activity) between 1 and 200),
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index study_blocks_user_week_idx on public.study_blocks (user_id, week_start);

-- ---------- Learning: course tracker ----------

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  subtitle text not null default 'Personal Learning Progress Tracker',
  quote text not null default '',
  start_date date not null,                       -- Monday of week 1
  target_date date not null,
  weekly_plan numeric(5, 2)[] not null default '{}', -- planned hours for week 1, 2, 3 …
  color public.color_name not null default 'blue',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_date > start_date)
);

create table public.course_units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  code text not null,                 -- "1", "2" …
  title text not null default '',
  color public.color_name not null default 'blue',
  position integer not null default 0
);
create index course_units_course_idx on public.course_units (course_id);

create table public.course_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  unit_id uuid not null references public.course_units (id) on delete cascade,
  code text not null,                 -- "1.1", "1.2" …
  title text not null check (char_length(title) between 1 and 300),
  short_title text not null default '',
  outcome text not null default '',   -- "What I will learn"
  est_hours numeric(5, 2) not null default 1 check (est_hours > 0),
  planned_week smallint check (planned_week >= 1),
  status text not null default 'not-started' check (status in ('not-started', 'in-progress', 'done')),
  actual_hours numeric(6, 2) not null default 0 check (actual_hours >= 0),
  notes text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index course_topics_course_idx on public.course_topics (course_id);

-- ---------- Finance ----------

create table public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color public.color_name not null default 'blue',
  icon text not null default 'wallet',
  monthly_limit numeric(12, 2) not null default 0 check (monthly_limit >= 0),
  is_savings boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount numeric(12, 2) not null check (amount > 0),
  budget_category_id uuid references public.budget_categories (id) on delete set null,
  description text not null check (char_length(description) between 1 and 200),
  note text not null default '',
  method text not null default 'Cash' check (method in ('bKash', 'Nagad', 'Card', 'Cash', 'Bank', 'Other')),
  tx_date date not null,
  created_at timestamptz not null default now(),
  check (type = 'expense' or budget_category_id is null)
);
create index transactions_user_date_idx on public.transactions (user_id, tx_date desc);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  note text not null default '',
  amount numeric(12, 2) not null check (amount > 0),
  budget_category_id uuid references public.budget_categories (id) on delete set null,
  icon text not null default 'receipt',
  due_date date not null,
  repeats_monthly boolean not null default false,
  paid_at timestamptz,
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index bills_user_due_idx on public.bills (user_id, due_date);

-- ---------- Health (one row per day) ----------

create table public.health_logs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  steps integer check (steps >= 0),
  sleep_minutes integer check (sleep_minutes between 0 and 1440),
  resting_hr integer check (resting_hr between 20 and 250),
  weight_kg numeric(5, 2) check (weight_kg > 0),
  water_glasses integer not null default 0 check (water_glasses between 0 and 50),
  mood smallint check (mood between 1 and 10),
  updated_at timestamptz not null default now(),
  primary key (user_id, log_date)
);

-- ---------- Notes & reminders ----------

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '',
  tag text not null default 'Personal',
  color public.color_name not null default 'white',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 200),
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- updated_at triggers ----------

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger events_updated_at before update on public.events for each row execute function public.set_updated_at();
create trigger goals_updated_at before update on public.goals for each row execute function public.set_updated_at();
create trigger courses_updated_at before update on public.courses for each row execute function public.set_updated_at();
create trigger course_topics_updated_at before update on public.course_topics for each row execute function public.set_updated_at();
create trigger notes_updated_at before update on public.notes for each row execute function public.set_updated_at();
create trigger health_logs_updated_at before update on public.health_logs for each row execute function public.set_updated_at();

-- ---------- Row Level Security: every user sees only their own rows ----------

alter table public.profiles enable row level security;
create policy "Own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['categories', 'tasks', 'events', 'goals', 'goal_milestones', 'habits', 'habit_logs',
                           'study_weeks', 'study_blocks', 'courses', 'course_units', 'course_topics',
                           'budget_categories', 'transactions', 'bills', 'health_logs', 'notes', 'reminders']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "Own rows" on public.%I for all to authenticated
                      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Signed-out visitors get nothing at all; signed-in users get normal table access (RLS still applies).
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------- Defaults for a new account ----------

-- Runs as the caller, so RLS still checks every insert.
create function public.create_default_rows(p_user uuid) returns void
language plpgsql set search_path = '' as $$
begin
  insert into public.categories (user_id, name, color, position) values
    (p_user, 'Work', 'blue', 0), (p_user, 'Finance', 'amber', 1), (p_user, 'Health', 'emerald', 2),
    (p_user, 'Personal', 'violet', 3), (p_user, 'Home', 'orange', 4), (p_user, 'Learning', 'teal', 5)
  on conflict (user_id, name) do nothing;

  insert into public.budget_categories (user_id, name, color, icon, monthly_limit, is_savings, position) values
    (p_user, 'Housing', 'blue', 'house', 18000, false, 0),
    (p_user, 'Food', 'violet', 'utensils', 12000, false, 1),
    (p_user, 'Transport', 'orange', 'car', 7000, false, 2),
    (p_user, 'Lifestyle', 'yellow', 'sparkles', 8000, false, 3),
    (p_user, 'Savings', 'emerald', 'piggy-bank', 15000, true, 4)
  on conflict (user_id, name) do nothing;
end $$;

-- A new sign-up gets a profile and the default categories.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  perform public.create_default_rows(new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Safety net for accounts made before this file was run: the API calls this on every sign-in.
create function public.ensure_profile() returns public.profiles
language plpgsql set search_path = '' as $$
declare
  uid uuid := auth.uid();
  result public.profiles;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  select * into result from public.profiles where id = uid;
  if not found then
    insert into public.profiles (id) values (uid) returning * into result;
    perform public.create_default_rows(uid);
  end if;
  return result;
end $$;

-- ---------- Pay a bill: add the expense and mark the bill paid in one step ----------

create function public.pay_bill(p_bill_id uuid, p_method text, p_date date) returns public.transactions
language plpgsql set search_path = '' as $$
declare
  bill public.bills;
  tx public.transactions;
begin
  select * into bill from public.bills where id = p_bill_id for update;
  if not found then
    raise exception 'Bill not found';
  end if;
  if bill.paid_at is not null then
    raise exception 'This bill is already paid';
  end if;

  insert into public.transactions (user_id, type, amount, budget_category_id, description, note, method, tx_date)
  values (bill.user_id, 'expense', bill.amount, bill.budget_category_id, bill.name, bill.note, p_method, p_date)
  returning * into tx;

  update public.bills set paid_at = now(), transaction_id = tx.id where id = bill.id;

  -- A monthly bill comes back next month.
  if bill.repeats_monthly then
    insert into public.bills (user_id, name, note, amount, budget_category_id, icon, due_date, repeats_monthly)
    values (bill.user_id, bill.name, bill.note, bill.amount, bill.budget_category_id, bill.icon,
            (bill.due_date + interval '1 month')::date, true);
  end if;

  return tx;
end $$;

-- ---------- Delete everything (keeps the account and profile) ----------

create function public.delete_my_data() returns void
language plpgsql set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  delete from public.bills where user_id = uid;
  delete from public.transactions where user_id = uid;
  delete from public.course_topics where user_id = uid;
  delete from public.course_units where user_id = uid;
  delete from public.courses where user_id = uid;
  delete from public.study_blocks where user_id = uid;
  delete from public.study_weeks where user_id = uid;
  delete from public.habit_logs where user_id = uid;
  delete from public.habits where user_id = uid;
  delete from public.goal_milestones where user_id = uid;
  delete from public.goals where user_id = uid;
  delete from public.events where user_id = uid;
  delete from public.tasks where user_id = uid;
  delete from public.health_logs where user_id = uid;
  delete from public.notes where user_id = uid;
  delete from public.reminders where user_id = uid;
  delete from public.budget_categories where user_id = uid;
  delete from public.categories where user_id = uid;
  perform public.create_default_rows(uid);
end $$;

revoke execute on function public.create_default_rows(uuid) from public, anon;
revoke execute on function public.ensure_profile() from public, anon;
revoke execute on function public.pay_bill(uuid, text, date) from public, anon;
revoke execute on function public.delete_my_data() from public, anon;
grant execute on function public.create_default_rows(uuid) to authenticated;
grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.pay_bill(uuid, text, date) to authenticated;
grant execute on function public.delete_my_data() to authenticated;
