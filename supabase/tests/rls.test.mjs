// Checks the migrations in a throwaway in-memory Postgres (PGlite): security rules, triggers and functions.
// Run from supabase/tests:  npm install  then  npm test
import { fileURLToPath } from 'node:url';
import { makeDb, as } from './harness.mjs';

const dir = process.argv[2] || fileURLToPath(new URL('../migrations', import.meta.url));
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
const expectError = async (name, fn, match) => {
  try {
    await fn();
    check(name, false, 'no error');
  } catch (e) {
    check(name, !match || e.message.includes(match), e.message);
  }
};

const db = await makeDb(dir);
check('migrations ran', true);
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${A}', 'a@x.com', '{"full_name":"Nurullah"}'), ('${B}', 'b@x.com', '{}')`);
const qa = as(db, A);
const qb = as(db, B);
const qanon = as(db, null);

const prof = await qa('select full_name, timezone, weekly_study_goal from profiles');
check('signup trigger made profile', prof.length === 1 && prof[0].full_name === 'Nurullah', JSON.stringify(prof[0]));
check('signup trigger made categories', (await qa('select count(*)::int n from categories'))[0].n === 6);
check('signup trigger made budget categories', (await qa('select count(*)::int n from budget_categories'))[0].n === 5);

const today = '2026-10-01';
await qa('select load_sample_data($1)', [today]);
const counts = {};
for (const t of ['tasks', 'events', 'goals', 'goal_milestones', 'habits', 'habit_logs', 'study_weeks', 'study_blocks', 'courses', 'course_units', 'course_topics', 'transactions', 'bills', 'health_logs', 'notes', 'reminders']) {
  counts[t] = (await qa(`select count(*)::int n from ${t}`))[0].n;
}
check('sample data loaded', Object.values(counts).every((n) => n > 0), JSON.stringify(counts));
await expectError('sample data refuses a second load', () => qa('select load_sample_data($1)', [today]), 'empty account');

const spent = await qa(`select bc.name, coalesce(sum(t.amount), 0)::int spent from budget_categories bc
  left join transactions t on t.budget_category_id = bc.id and t.type = 'expense' group by bc.name, bc.position order by bc.position`);
check('budget totals match the template', spent.map((r) => r.spent).join(',') === '15750,8100,5400,6750,9000', spent.map((r) => `${r.name}=${r.spent}`).join(' '));
const hours = await qa('select sum(est_hours)::float est, sum(actual_hours)::float actual from course_topics');
check('course hours (51 estimated, 7.5 spent)', hours[0].est === 51 && hours[0].actual === 7.5, JSON.stringify(hours[0]));

check("user B sees none of A's tasks", (await qb('select count(*)::int n from tasks'))[0].n === 0);
check('user B has own defaults only', (await qb('select count(*)::int n from categories'))[0].n === 6);
const aTask = (await qa('select id from tasks limit 1'))[0].id;
check("user B cannot update A's task", (await qb('update tasks set title = $1 where id = $2 returning id', ['hacked', aTask])).length === 0);
check("user B cannot delete A's task", (await qb('delete from tasks where id = $1 returning id', [aTask])).length === 0);
await expectError('user B cannot insert a row for A', () => qb('insert into notes (user_id, title) values ($1, $2)', [A, 'x']), 'row-level security');
await expectError('signed-out visitor cannot read tasks', () => qanon('select * from tasks'), 'permission denied');
await expectError('signed-out visitor cannot call functions', () => qanon('select load_sample_data($1)', [today]), 'permission denied');

const bill = (await qa(`select id from bills where name = 'Electricity bill'`))[0].id;
await expectError("user B cannot pay A's bill", () => qb('select pay_bill($1, $2, $3)', [bill, 'bKash', today]), 'Bill not found');
const tx = await qa('select * from pay_bill($1, $2, $3)', [bill, 'bKash', today]);
check('pay_bill adds the expense', tx.length === 1 && Number(tx[0].amount) === 1850, JSON.stringify({ amount: tx[0].amount, method: tx[0].method, date: tx[0].tx_date }));
const bills = await qa(`select due_date::text, paid_at is not null as paid from bills where name = 'Electricity bill' order by due_date`);
check('pay_bill marks paid and adds next month', bills.length === 2 && bills[0].paid && !bills[1].paid && bills[1].due_date === '2026-10-30', JSON.stringify(bills));
await expectError('cannot pay the same bill twice', () => qa('select pay_bill($1, $2, $3)', [bill, 'bKash', today]), 'already paid');

await expectError('bad colour rejected', () => qa(`insert into notes (title, color) values ('x', 'purple')`), 'color_name');
await expectError('event end before start rejected', () => qa(`insert into events (title, event_date, start_time, end_time) values ('x', $1, '10:00', '09:00')`, [today]), 'check constraint');
await expectError('study week must start on Monday', () => qa(`insert into study_weeks (week_start) values ('2026-10-01')`), 'check constraint');
await expectError('task end date before due date rejected', () => qa(`insert into tasks (title, due_date, end_date) values ('x', '2026-10-06', '2026-10-05')`), 'check constraint');
await expectError('task end date without due date rejected', () => qa(`insert into tasks (title, end_date) values ('x', '2026-10-06')`), 'check constraint');
const range = await qa(`insert into tasks (title, due_date, end_date) values ('Trip', '2026-10-06', '2026-10-09') returning end_date::text`);
check('task with an end date saves', range[0]?.end_date === '2026-10-09');

// Projects (20261007000000_projects.sql)
const bakery = await qa(`insert into projects (name, due_date) values ('Bakery site', '2026-10-20') returning id, kind, status, color, start_date::text, due_date::text`);
check('project saves with defaults', bakery[0]?.kind === 'other' && bakery[0].status === 'active' && bakery[0].color === 'blue' && bakery[0].start_date === null, JSON.stringify(bakery[0]));
const ongoing = await qa(`insert into projects (name, kind) values ('Personal branding', 'brand') returning id, due_date`);
check('a project with no dates (ongoing) is allowed', ongoing[0]?.due_date === null);
const dated = await qa(`insert into projects (name, start_date, due_date) values ('Same day', '2026-10-10', '2026-10-10') returning id`);
check('start and due on the same day is allowed', dated.length === 1);
await expectError('due date before start date rejected', () => qa(`insert into projects (name, start_date, due_date) values ('x', '2026-10-10', '2026-10-01')`), 'check constraint');
await expectError('unknown project type rejected', () => qa(`insert into projects (name, kind) values ('x', 'game')`), 'check constraint');
await expectError('unknown project status rejected', () => qa(`insert into projects (name, status) values ('x', 'lost')`), 'check constraint');
await expectError('empty project name rejected', () => qa(`insert into projects (name) values ('')`), 'check constraint');
await expectError('bad colour on a project rejected', () => qa(`insert into projects (name, color) values ('x', 'purple')`), 'color_name');
await expectError('links must be a list', () => qa(`insert into projects (name, links) values ('x', '{"a": 1}')`), 'check constraint');
await expectError('more than 12 links rejected', () => qa(`insert into projects (name, links) values ('x', (select jsonb_agg(jsonb_build_object('label', 'l', 'url', 'https://a.com')) from generate_series(1, 13)))`), 'check constraint');
const twelve = await qa(`insert into projects (name, links) values ('Twelve links', (select jsonb_agg(jsonb_build_object('label', 'l', 'url', 'https://a.com')) from generate_series(1, 12))) returning jsonb_array_length(links)::int n`);
check('12 links are allowed', twelve[0]?.n === 12);
const touched = await qa(`update projects set name = 'Bakery website' where id = $1 returning updated_at > created_at as moved`, [bakery[0].id]);
check('project "last edited" time updates', touched[0]?.moved === true);

check("user B sees none of A's projects", (await qb('select count(*)::int n from projects'))[0].n === 0);
check("user B cannot update A's project", (await qb(`update projects set name = 'hacked' where id = $1 returning id`, [bakery[0].id])).length === 0);
check("user B cannot delete A's project", (await qb('delete from projects where id = $1 returning id', [bakery[0].id])).length === 0);
await expectError('user B cannot insert a project for A', () => qb(`insert into projects (user_id, name) values ($1, 'x')`, [A]), 'row-level security');
await expectError('signed-out visitor cannot read projects', () => qanon('select * from projects'), 'permission denied');

// Archive (20261007000100_projects_archive.sql): archived_at is empty until a project is archived, and can be cleared again.
check('a new project is not archived', (await qa('select archived_at from projects where id = $1', [ongoing[0].id]))[0].archived_at === null);
const archivedRow = await qa('update projects set archived_at = now() where id = $1 returning archived_at is not null as archived', [ongoing[0].id]);
check('a project can be archived', archivedRow[0]?.archived === true);
check("user B cannot archive A's project", (await qb('update projects set archived_at = now() where id = $1 returning id', [dated[0].id])).length === 0);
const restored = await qa('update projects set archived_at = null where id = $1 returning archived_at', [ongoing[0].id]);
check('an archived project can be restored', restored[0]?.archived_at === null);

// Tasks can belong to a project; deleting the project deletes its tasks (and only those).
const before = (await qa('select count(*)::int n from tasks'))[0].n;
await qa(`insert into tasks (title, project_id) values ('Design home page', $1), ('Build menu page', $1)`, [bakery[0].id]);
check('tasks can be linked to a project', (await qa('select count(*)::int n from tasks where project_id = $1', [bakery[0].id]))[0].n === 2);
await qa('delete from projects where id = $1', [bakery[0].id]);
check('deleting a project deletes its tasks', (await qa('select count(*)::int n from tasks where project_id = $1', [bakery[0].id]))[0].n === 0);
check('other tasks are untouched by a project delete', (await qa('select count(*)::int n from tasks'))[0].n === before);

await qa('select delete_my_data()');
check('delete_my_data empties the account', (await qa('select count(*)::int n from tasks'))[0].n === 0 && (await qa('select count(*)::int n from transactions'))[0].n === 0);
check('delete_my_data keeps profile and recreates defaults', (await qa('select count(*)::int n from profiles'))[0].n === 1 && (await qa('select count(*)::int n from categories'))[0].n === 6);
check('delete_my_data leaves projects alone (the delete-all route removes them first)', (await qa('select count(*)::int n from projects'))[0].n >= 1);
check("user B unaffected by A's delete", (await qb('select count(*)::int n from categories'))[0].n === 6);

await db.exec(`delete from profiles where id = '${B}'; delete from categories where user_id = '${B}';`);
const ensured = await qb('select id from ensure_profile()');
check('ensure_profile repairs a missing profile', ensured[0].id === B && (await qb('select count(*)::int n from categories'))[0].n === 6);

// Security advisor fixes (20261006000100_security_hardening.sql)
const fn = (await db.query(`select proconfig from pg_proc where oid = 'public.set_updated_at()'::regprocedure`)).rows[0];
check('set_updated_at has a fixed search path', JSON.stringify(fn.proconfig).includes('search_path'), JSON.stringify(fn.proconfig));
const stamped = await qa(`insert into tasks (title) values ('Stamp me') returning id`);
const edited = await qa(`update tasks set title = 'Stamped' where id = $1 returning updated_at > created_at as moved`, [stamped[0].id]);
check('"last edited" time still updates', edited[0]?.moved === true);
const callable = (await db.query(`select has_function_privilege('anon', 'public.handle_new_user()', 'execute') as anon, has_function_privilege('authenticated', 'public.handle_new_user()', 'execute') as signed_in`)).rows[0];
check('sign-up function cannot be called through the API', !callable.anon && !callable.signed_in, JSON.stringify(callable));
// Supabase Auth creates accounts with its own role, not the owner: sign-up must still set up the profile.
const C = '33333333-3333-3333-3333-333333333333';
await db.exec(`create role fake_auth_admin nologin; grant usage on schema auth to fake_auth_admin; grant insert on auth.users to fake_auth_admin;`);
await db.exec(`set role fake_auth_admin; insert into auth.users (id, email) values ('${C}', 'c@x.com'); reset role;`);
check('sign-up still creates the profile and categories', (await as(db, C)('select count(*)::int n from categories'))[0].n === 6);

console.log(results.join('\n'));
const failed = results.some((r) => r.startsWith('FAIL'));
console.log(failed ? '\nSOME CHECKS FAILED' : `\nALL ${results.length} CHECKS PASSED`);
if (failed) process.exitCode = 1;
