-- =====================================================================
-- Nurullah POS — sample data
-- Run this after 20261001000000_init.sql. It only creates a function;
-- nothing is added until you press "Load sample data" in Settings.
--
-- The data is the same as the HTML template's, placed around the given
-- day so the app looks alive. Your Level 4 IQA course is included with
-- its real dates (14 Sep → 31 Dec 2026).
-- =====================================================================

create function public.load_sample_data(p_today date) returns void
language plpgsql set search_path = '' as $$
declare
  uid uuid := auth.uid();
  monday date := p_today - (extract(isodow from p_today)::int - 1);
  month_start date := date_trunc('month', p_today)::date;
  c_work uuid; c_finance uuid; c_health uuid; c_personal uuid; c_home uuid; c_learning uuid;
  b_housing uuid; b_food uuid; b_transport uuid; b_lifestyle uuid; b_savings uuid;
  g uuid; h uuid; course uuid; u1 uuid; u2 uuid; u3 uuid; u4 uuid;
  steps int[] := '{6900,8200,9400,7700,10100,5400,8800,7200,10450,9100,6300,11200,8800,8432}';
  sleep int[] := '{420,450,400,465,430,390,480,390,435,480,405,450,495,440}';
  heart int[] := '{64,63,65,62,63,61,62,64,63,62,61,62,63,62}';
  water int[] := '{7,8,6,8,5,8,7,8,6,8,7,8,8,6}';
  mood int[] := '{7,8,6,7,8,6,7,7,8,7,6,8,8,8}';
  weight numeric[] := '{73,72.9,72.9,72.8,72.9,72.7,72.6,72.6,72.5,72.4}';
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if exists (select 1 from public.tasks where user_id = uid)
     or exists (select 1 from public.habits where user_id = uid)
     or exists (select 1 from public.transactions where user_id = uid)
     or exists (select 1 from public.notes where user_id = uid) then
    raise exception 'Sample data can only be added to an empty account. Delete your data in Settings first.';
  end if;

  perform public.create_default_rows(uid);
  select id into c_work from public.categories where user_id = uid and name = 'Work';
  select id into c_finance from public.categories where user_id = uid and name = 'Finance';
  select id into c_health from public.categories where user_id = uid and name = 'Health';
  select id into c_personal from public.categories where user_id = uid and name = 'Personal';
  select id into c_home from public.categories where user_id = uid and name = 'Home';
  select id into c_learning from public.categories where user_id = uid and name = 'Learning';
  select id into b_housing from public.budget_categories where user_id = uid and name = 'Housing';
  select id into b_food from public.budget_categories where user_id = uid and name = 'Food';
  select id into b_transport from public.budget_categories where user_id = uid and name = 'Transport';
  select id into b_lifestyle from public.budget_categories where user_id = uid and name = 'Lifestyle';
  select id into b_savings from public.budget_categories where user_id = uid and name = 'Savings';

  -- ---------- Tasks ----------
  insert into public.tasks (title, category_id, due_date, priority, done_at) values
    ('Pay electricity bill', c_finance, p_today - 1, 'high', null),
    ('Finish project proposal', c_work, p_today, 'high', now()),
    ('Review monthly expenses', c_finance, p_today, 'medium', now()),
    ('Go to the gym', c_health, p_today, 'medium', null),
    ('Read 30 minutes', c_personal, p_today, 'low', null),
    ('Plan weekend trip', c_personal, p_today, 'low', null),
    ('Clean workspace', c_home, p_today, 'low', null),
    ('Complete IQA Unit 1.3 notes', c_learning, p_today + 1, 'high', null),
    ('Book dentist appointment', c_health, p_today + 1, 'medium', null),
    ('Prepare retrospective slides', c_work, p_today + 3, 'medium', null),
    ('Buy groceries for the week', c_home, p_today + 4, 'low', null),
    ('Call the bank about a savings account', c_finance, p_today + 5, 'medium', null),
    ('Renew car insurance', c_finance, p_today + 14, 'high', null);

  -- Finished tasks from the last two weeks (they feed the productivity chart).
  insert into public.tasks (title, category_id, due_date, priority, done_at)
  select (array['Inbox zero', 'Daily planning', 'Workout', 'Code review', 'Groceries', 'Read an article', 'Team check-in'])[1 + (v.d + n) % 7],
         (array[c_work, c_work, c_health, c_work, c_home, c_personal, c_work])[1 + (v.d + n) % 7],
         p_today - v.d, 'low', (p_today - v.d)::timestamp + interval '10 hours'
  from (values (1, 4), (2, 3), (3, 2), (4, 5), (5, 3), (6, 4), (7, 2), (8, 3), (9, 2), (10, 3), (11, 2), (12, 2), (13, 1)) as v(d, cnt),
       generate_series(1, v.cnt) as n;

  -- ---------- Calendar ----------
  insert into public.events (title, event_date, start_time, end_time, all_day, repeat, category_id, note) values
    ('Morning Routine', p_today, '07:00', '08:30', false, 'daily', c_personal, 'Exercise • Shower • Breakfast'),
    ('Deep Work', p_today, '09:00', '12:00', false, 'none', c_work, 'Work on project proposal'),
    ('Lunch Break', p_today, '12:00', '13:00', false, 'none', c_health, 'Healthy meal & short walk'),
    ('Team Sync', p_today, '13:00', '13:30', false, 'weekly', c_work, 'Zoom meeting'),
    ('Personal Finance', p_today, '15:00', '16:00', false, 'none', c_finance, 'Review expenses'),
    ('Gym', p_today, '18:00', '19:00', false, 'none', c_health, 'Strength training'),
    ('Read', p_today, '20:00', '20:30', false, 'daily', c_personal, '30 minutes'),
    ('Wind Down', p_today, '21:30', '22:00', false, 'daily', c_personal, 'Journaling • Plan tomorrow'),
    ('Team offsite', p_today - 10, '10:00', '16:00', false, 'none', c_work, 'Gulshan'),
    ('IQA course kickoff', p_today - 7, '19:00', '20:00', false, 'none', c_learning, 'Unit 1 · Week 1'),
    ('Movie night', p_today - 3, '20:00', '22:30', false, 'none', c_personal, 'With family'),
    ('Electricity bill due', p_today - 1, null, null, true, 'none', c_finance, ''),
    ('Study: practice exercises', p_today + 2, '19:30', '20:30', false, 'none', c_learning, '1h planned'),
    ('Dentist appointment', p_today + 3, '10:30', '11:15', false, 'none', c_health, 'Dhanmondi'),
    ('Team retrospective', p_today + 3, '15:00', '16:00', false, 'none', c_work, 'Meeting room B'),
    ('Study: read chapter 3', p_today + 4, '19:00', '21:00', false, 'none', c_learning, '2h planned'),
    ('Family dinner', p_today + 5, '19:30', '21:30', false, 'none', c_personal, 'Home'),
    ('Study: project practice', p_today + 6, '10:00', '13:30', false, 'none', c_learning, '3.5h planned'),
    ('Project proposal deadline', p_today + 7, null, null, true, 'none', c_work, ''),
    ('Monthly budget review', p_today + 9, '15:00', '16:00', false, 'none', c_finance, 'Close the month'),
    ('Sarah''s birthday', p_today + 11, null, null, true, 'none', c_personal, ''),
    ('Doctor check-up', p_today + 12, '17:00', '17:30', false, 'none', c_health, 'Yearly'),
    ('Car insurance renewal', p_today + 14, null, null, true, 'none', c_finance, ''),
    ('Friend''s wedding', p_today + 18, '18:00', '23:00', false, 'none', c_personal, 'Dhaka');

  -- ---------- Goals ----------
  insert into public.goals (title, category_id, icon, color, status, progress_mode, current_value, target_value, unit, deadline)
  values ('Build Emergency Fund', c_finance, 'piggy-bank', 'emerald', 'on-track', 'value', 140000, 200000, '৳', p_today + 101)
  returning id into g;
  insert into public.goal_milestones (goal_id, title, at_value, position) values
    (g, 'Save ৳50,000', 50000, 0), (g, 'Save ৳1,00,000', 100000, 1),
    (g, 'Save ৳1,50,000', 150000, 2), (g, 'Six months of expenses: ৳2,00,000', 200000, 3);

  insert into public.goals (title, category_id, icon, color, status, progress_mode, current_value, target_value, unit, deadline)
  values ('Run a 10K', c_health, 'footprints', 'blue', 'behind', 'value', 4, 10, 'km', p_today + 82)
  returning id into g;
  insert into public.goal_milestones (goal_id, title, at_value, position) values
    (g, 'Run 2 km without stopping', 2, 0), (g, 'Run 4 km', 4, 1), (g, 'Run 6 km', 6, 2),
    (g, 'Run 8 km', 8, 3), (g, 'Race day: 10 km', 10, 4);

  insert into public.goals (title, category_id, icon, color, status, progress_mode, deadline)
  values ('Learn a New Skill: Data Analytics', c_learning, 'graduation-cap', 'violet', 'on-track', 'milestones', p_today + 191)
  returning id into g;
  insert into public.goal_milestones (goal_id, title, done, position) values
    (g, 'Excel basics', true, 0), (g, 'SQL fundamentals', true, 1), (g, 'Power BI dashboards', true, 2),
    (g, 'Python with pandas', false, 3), (g, 'Capstone project', false, 4);

  insert into public.goals (title, category_id, icon, color, status, progress_mode, current_value, target_value, unit, deadline)
  values ('Travel to Japan', c_personal, 'plane', 'pink', 'behind', 'value', 75000, 300000, '৳', p_today + 196)
  returning id into g;
  insert into public.goal_milestones (goal_id, title, done, position) values
    (g, 'Renew passport', true, 0), (g, 'Plan the route: Tokyo, Kyoto, Osaka', false, 1),
    (g, 'Book flights', false, 2), (g, 'Apply for the visa', false, 3);

  insert into public.goals (title, category_id, icon, color, status, progress_mode, current_value, target_value, unit, deadline)
  values ('Read 24 Books This Year', c_personal, 'book-open', 'amber', 'on-track', 'value', 12, 24, 'books',
          make_date(extract(year from p_today)::int, 12, 31));

  insert into public.goals (title, category_id, icon, color, status, progress_mode, current_value, target_value, unit, deadline, completed_on, note)
  values ('Run a 5K', c_health, 'medal', 'emerald', 'completed', 'value', 5, 5, 'km', p_today - 190, p_today - 190,
          'Finished in 31 minutes. This led to the 10K goal.');

  -- ---------- Habits (older history for the heatmap + recent runs for the streaks) ----------
  insert into public.habits (name, goal_text, icon, color, position) values ('Exercise', '30 min · every day', 'dumbbell', 'orange', 0) returning id into h;
  insert into public.habit_logs (habit_id, log_date) select h, p_today - d from generate_series(25, 140) d where d % 5 <> 0;
  insert into public.habit_logs (habit_id, log_date) select h, p_today - d from generate_series(1, 12) d;

  insert into public.habits (name, goal_text, icon, color, position) values ('Read', '20 pages · every day', 'book-open', 'amber', 1) returning id into h;
  insert into public.habit_logs (habit_id, log_date) select h, p_today - d from generate_series(25, 140) d where (d + 1) % 5 <> 0;
  insert into public.habit_logs (habit_id, log_date) select h, p_today - d from generate_series(0, 7) d;

  insert into public.habits (name, goal_text, icon, color, position) values ('Meditate', '10 min · every day', 'brain', 'violet', 2) returning id into h;
  insert into public.habit_logs (habit_id, log_date) select h, p_today - d from generate_series(25, 140) d where (d + 2) % 4 <> 0;
  insert into public.habit_logs (habit_id, log_date) select h, p_today - d from generate_series(1, 9) d where d <> 4;

  insert into public.habits (name, goal_text, icon, color, position) values ('Drink Water', '8 glasses · every day', 'glass-water', 'sky', 3) returning id into h;
  insert into public.habit_logs (habit_id, log_date) select h, p_today - d from generate_series(25, 140) d where (d + 3) % 7 <> 0;
  insert into public.habit_logs (habit_id, log_date) select h, p_today - d from generate_series(0, 20) d;

  insert into public.habits (name, goal_text, icon, color, position) values ('Eat Healthy', 'No junk food · every day', 'salad', 'emerald', 4) returning id into h;
  insert into public.habit_logs (habit_id, log_date) select h, p_today - d from generate_series(25, 140) d where (d + 4) % 5 <> 0;
  insert into public.habit_logs (habit_id, log_date) select h, p_today - d from generate_series(1, 14) d;

  insert into public.habits (name, goal_text, icon, color, position) values ('Sleep Before 11', 'Lights out by 11 PM', 'moon', 'indigo', 5) returning id into h;
  insert into public.habit_logs (habit_id, log_date) select h, p_today - d from generate_series(25, 140) d where (d + 5) % 3 <> 0;
  insert into public.habit_logs (habit_id, log_date) select h, p_today - d from generate_series(1, 8) d where d not in (3, 4);

  -- ---------- Learning: this week's plan ----------
  insert into public.study_weeks (week_start, topic, goal_hours) values (monday, 'Data Analytics Basics', 8);
  insert into public.study_blocks (week_start, weekday, hours, activity, done) values
    (monday, 0, 1.5, 'Watch lesson videos', true),
    (monday, 2, 1, 'Practice exercises', true),
    (monday, 4, 2, 'Read chapter 3', false),
    (monday, 6, 3.5, 'Project practice', false);

  -- ---------- Learning: the IQA course ----------
  insert into public.courses (title, quote, start_date, target_date, weekly_plan)
  values ('Level 4 Award in the Internal Quality Assurance of Assessment Processes and Practice (RQF)',
          'Plan your learning. Track your progress. Achieve your goal.',
          '2026-09-14', '2026-12-31', '{5,5,4,4,4,4,4,3,3,3,3,3,3,3,3,3}')
  returning id into course;

  insert into public.course_units (course_id, code, title, color, position) values (course, '1', 'Unit 1', 'blue', 0) returning id into u1;
  insert into public.course_units (course_id, code, title, color, position) values (course, '2', 'Unit 2', 'emerald', 1) returning id into u2;
  insert into public.course_units (course_id, code, title, color, position) values (course, '3', 'Unit 3', 'orange', 2) returning id into u3;
  insert into public.course_units (course_id, code, title, color, position) values (course, '4', 'Unit 4', 'violet', 3) returning id into u4;

  insert into public.course_topics (course_id, unit_id, code, title, short_title, outcome, est_hours, planned_week, status, actual_hours, notes, position) values
    (course, u1, '1.1', 'The purpose and principles of internal quality assurance', 'Purpose & principles of IQA', 'Understand the purpose, principles and benefits of IQA', 3, 1, 'done', 3, 'Read textbook, make notes', 0),
    (course, u1, '1.2', 'The internal quality assurance process', 'The IQA process', 'Learn the IQA process and key stages', 3, 1, 'done', 3, 'Watched video, summary notes', 1),
    (course, u1, '1.3', 'Responsibilities of the internal quality assurer', 'Responsibilities of IQA', 'Understand roles and responsibilities', 3, 2, 'in-progress', 1.5, 'Continue reading and examples', 2),
    (course, u1, '1.4', 'Legal and regulatory requirements', 'Legal & regulatory requirements', 'Learn relevant legislation, regulations and guidance', 3, 2, 'not-started', 0, 'Use official guidelines', 3),
    (course, u1, '1.5', 'Internal quality assurance documentation', 'IQA documentation', 'Explore key documents and records', 2, 3, 'not-started', 0, 'Review templates', 4),
    (course, u2, '2.1', 'Planning internal quality assurance', 'Planning IQA', 'Learn how to plan IQA activities', 4, 4, 'not-started', 0, 'Plan own IQA schedule', 5),
    (course, u2, '2.2', 'Sampling for internal quality assurance', 'Sampling for IQA', 'Understand sampling methods and rationale', 3, 4, 'not-started', 0, 'Case studies', 6),
    (course, u2, '2.3', 'Conducting internal quality assurance', 'Conducting IQA', 'Learn how to carry out IQA activities', 4, 5, 'not-started', 0, 'Practical examples', 7),
    (course, u2, '2.4', 'Providing constructive feedback', 'Constructive feedback', 'Learn how to give effective feedback', 3, 5, 'not-started', 0, 'Communication techniques', 8),
    (course, u2, '2.5', 'Recording outcomes of internal quality assurance', 'Recording IQA outcomes', 'Understand how to record and report IQA findings', 3, 6, 'not-started', 0, 'Use template forms', 9),
    (course, u3, '3.1', 'Monitoring the actions from IQA', 'Monitoring IQA actions', 'Learn how to monitor and follow up actions', 3, 7, 'not-started', 0, 'Review action plans', 10),
    (course, u3, '3.2', 'Contributing to the development of assessment practice', 'Developing assessment practice', 'Understand how IQA supports improvement', 3, 8, 'not-started', 0, 'Reflect on own practice', 11),
    (course, u3, '3.3', 'Working with others in the quality assurance process', 'Working with others', 'Learn how to collaborate with assessors and others', 3, 8, 'not-started', 0, 'Team work examples', 12),
    (course, u4, '4.1', 'Reviewing the effectiveness of internal quality assurance', 'Reviewing IQA effectiveness', 'Learn how to evaluate IQA effectiveness', 4, 9, 'not-started', 0, 'Self-reflection', 13),
    (course, u4, '4.2', 'Planning for continuous improvement', 'Continuous improvement', 'Learn how to support ongoing improvement', 4, 10, 'not-started', 0, 'Set future goals', 14),
    (course, u4, '4.3', 'Professional development', 'Professional development', 'Identify own CPD needs as an IQA', 3, 10, 'not-started', 0, 'Create CPD plan', 15);

  -- ---------- Finance: this month ----------
  insert into public.transactions (type, amount, budget_category_id, description, note, method, tx_date) values
    ('expense', 2350, b_food, 'Groceries', 'Shwapno', 'bKash', greatest(month_start, p_today - 1)),
    ('expense', 420, b_transport, 'Pathao ride', 'Office to home', 'bKash', greatest(month_start, p_today - 2)),
    ('expense', 870, b_food, 'Dinner delivery', 'Foodpanda', 'Card', greatest(month_start, p_today - 3)),
    ('expense', 1200, b_lifestyle, 'Movie tickets', 'Family movie night', 'Card', greatest(month_start, p_today - 3)),
    ('expense', 1250, b_food, 'Team lunch', 'Gulshan', 'Cash', greatest(month_start, p_today - 5)),
    ('income', 10000, null, 'Freelance project', 'Website design', 'Bank', greatest(month_start, p_today - 6)),
    ('expense', 680, b_transport, 'Uber ride', 'Dhanmondi', 'Card', greatest(month_start, p_today - 6)),
    ('expense', 1980, b_food, 'Groceries', 'Meena Bazar', 'Card', greatest(month_start, p_today - 8)),
    ('expense', 2300, b_lifestyle, 'New shirt', 'Aarong', 'Card', greatest(month_start, p_today - 9)),
    ('expense', 2500, b_transport, 'Fuel', 'Octane, full tank', 'Cash', greatest(month_start, p_today - 10)),
    ('expense', 9000, b_savings, 'Emergency fund', 'Monthly transfer', 'Bank', greatest(month_start, p_today - 11)),
    ('expense', 650, b_food, 'Fruits and vegetables', 'Local market', 'Cash', greatest(month_start, p_today - 12)),
    ('expense', 1000, b_transport, 'Metro rail card top-up', 'MRT pass', 'Cash', greatest(month_start, p_today - 13)),
    ('expense', 1000, b_food, 'Groceries', 'Shwapno', 'bKash', greatest(month_start, p_today - 15)),
    ('expense', 950, b_housing, 'Gas bill', 'Titas Gas', 'bKash', greatest(month_start, p_today - 16)),
    ('expense', 900, b_housing, 'Water bill', 'Dhaka WASA', 'bKash', greatest(month_start, p_today - 16)),
    ('expense', 800, b_transport, 'Pathao rides', 'Weekend trips', 'Nagad', greatest(month_start, p_today - 18)),
    ('expense', 750, b_lifestyle, 'Streaming subscriptions', 'Music and video', 'Card', greatest(month_start, p_today - 19)),
    ('expense', 2500, b_lifestyle, 'Gym membership', 'Monthly fee', 'Card', greatest(month_start, p_today - 20)),
    ('expense', 13900, b_housing, 'House rent', 'Mohammadpur flat', 'Bank', greatest(month_start, p_today - 20)),
    ('income', 75000, null, 'Salary', 'Monthly pay', 'Bank', greatest(month_start, p_today - 20));

  insert into public.bills (name, note, amount, budget_category_id, icon, due_date, repeats_monthly) values
    ('Electricity bill', 'DESCO', 1850, b_housing, 'zap', p_today - 1, true),
    ('Internet', 'Home broadband', 1200, b_housing, 'wifi', p_today + 3, true),
    ('Phone bill', 'Postpaid', 600, b_housing, 'smartphone', p_today + 9, true),
    ('Car insurance', 'Yearly renewal', 18500, b_transport, 'car', p_today + 14, false);

  -- ---------- Health: last 14 days, weight every 3 days ----------
  insert into public.health_logs (log_date, steps, sleep_minutes, resting_hr, water_glasses, mood)
  select p_today - (14 - i), steps[i], sleep[i], heart[i], water[i], mood[i]
  from generate_series(1, 14) i;

  insert into public.health_logs (log_date, weight_kg)
  select p_today - (27 - 3 * j), weight[j + 1]
  from generate_series(0, 9) j
  on conflict (user_id, log_date) do update set weight_kg = excluded.weight_kg;

  -- ---------- Notes & reminders ----------
  -- updated_at is set too, so each note shows when it was last edited ("2 days ago" …).
  insert into public.notes (title, body, tag, color, pinned, created_at, updated_at)
  select title, body, tag, color, pinned, at, at from (values
    ('IQA Unit 1.3: key points', E'- The IQA checks the assessors'' work, not the learners.\n- Cycle: plan → sample → observe → give feedback → record.\n- Keep clear records for the awarding body.', 'Learning', 'sky', true, now()),
    ('Japan trip ideas', 'Tokyo (4 days), Kyoto (3 days), Osaka (2 days). Late March is best for cherry blossoms. Look into a JR Pass for the trains.', 'Travel', 'rose', true, now() - interval '2 days'),
    ('Project proposal outline', E'- The problem\n- Goals\n- Plan and timeline\n- Budget\n- Risks', 'Work', 'white', false, now() - interval '1 day'),
    ('Meal prep ideas', E'- Chicken and vegetables with brown rice\n- Lentil soup (dal)\n- Oats with banana\n- Grilled fish with salad', 'Health', 'emerald', false, now() - interval '3 days'),
    ('Books to read', E'- Atomic Habits (done)\n- Deep Work (done)\n- The Psychology of Money (done)\n- Ikigai (reading)\n- Make Time', 'Personal', 'amber', false, now() - interval '5 days'),
    ('Weekly review questions', E'- What went well this week?\n- What did not go well?\n- What will I change next week?\n- Did my week match my goals?', 'Personal', 'violet', false, now() - interval '7 days'),
    ('Gift ideas for Sarah', 'A good notebook, a small indoor plant, or a cooking class voucher.', 'Personal', 'rose', false, now() - interval '4 days'),
    ('A thought to keep', '"A better life is a series of small, intentional choices."', 'Personal', 'sky', false, now() - interval '10 days')
  ) as v (title, body, tag, color, pinned, at);

  insert into public.reminders (text, due_date) values
    ('Book dentist appointment', p_today + 1),
    ('Renew car insurance', p_today + 14),
    ('Plan birthday gift for Sarah', p_today + 7),
    ('Research weekend getaway spots', p_today + 4),
    ('Declutter wardrobe this month', p_today + 9);
end $$;

revoke execute on function public.load_sample_data(date) from public, anon;
grant execute on function public.load_sample_data(date) to authenticated;
