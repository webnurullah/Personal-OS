// Checks the migrations in a throwaway in-memory Postgres (PGlite): security rules, triggers and functions.
// Run from supabase/tests:  npm install  then  npm test
import { readFileSync } from 'node:fs';
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

// Profile photo (20261008000000_profile_photo.sql)
const file = (uid, ext = 'jpg') => `${uid}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.${ext}`;
const bucket = (await db.query(`select public, file_size_limit::int as max, allowed_mime_types from storage.buckets where id = 'avatars'`)).rows[0];
check('avatars bucket is public, capped at 512 KB, images only', bucket?.public === true && bucket.max === 524288 && bucket.allowed_mime_types.join() === 'image/jpeg,image/png,image/webp', JSON.stringify(bucket));
check('a profile starts without a photo', (await qa('select avatar_path from profiles'))[0].avatar_path === null);
check('profile can remember its photo path', (await qa('update profiles set avatar_path = $1 returning avatar_path', [file(A)]))[0].avatar_path === file(A));
for (const [name, bad] of [['no folder', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg'], ['a path that climbs out', `${A}/../x.jpg`], ['another file type', file(A, 'gif')], ['a long name', `${A}/${'a'.repeat(300)}.jpg`], ['upper case', file(A).toUpperCase()]]) {
  await expectError(`profile rejects a photo path with ${name}`, () => qa('update profiles set avatar_path = $1', [bad]), 'profiles_avatar_path_check');
}
check('profile can forget its photo', (await qa('update profiles set avatar_path = null returning avatar_path'))[0].avatar_path === null);

check('you can add a picture to your own folder', (await qa(`insert into storage.objects (bucket_id, name, owner_id) values ('avatars', $1, $2) returning name`, [file(A), A])).length === 1);
await expectError("you cannot add a picture to someone else's folder", () => qb(`insert into storage.objects (bucket_id, name, owner_id) values ('avatars', $1, $2)`, [file(A), B]), 'row-level security');
await db.exec(`insert into storage.buckets (id, name) values ('uploads', 'uploads')`);
await expectError('you cannot add files to other buckets', () => qa(`insert into storage.objects (bucket_id, name, owner_id) values ('uploads', $1, $2)`, [file(A), A]), 'violates');
await expectError('a signed-out visitor cannot add a picture (the rules refuse, not missing rights)', () => qanon(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [file(A)]), 'row-level security');
check("you cannot look up someone else's pictures", (await qb(`select name from storage.objects where bucket_id = 'avatars'`)).length === 0);
check('you can look up your own pictures', (await qa(`select name from storage.objects where bucket_id = 'avatars'`)).length === 1);
check("you cannot remove someone else's picture", (await qb(`delete from storage.objects where name = $1 returning id`, [file(A)])).length === 0);
check('you can remove your own picture', (await qa(`delete from storage.objects where name = $1 returning id`, [file(A)])).length === 1);
await qa(`insert into storage.objects (bucket_id, name, owner_id) values ('avatars', $1, $2)`, [file(A, 'png'), A]);
check('nothing in the bucket can be changed in place, so no overwriting (no update policy)', (await qa(`update storage.objects set name = $1 where name = $2 returning id`, [file(A, 'webp'), file(A, 'png')])).length === 0 && (await qb(`update storage.objects set name = $1 returning id`, ['x'])).length === 0 && (await qa(`select name from storage.objects where bucket_id = 'avatars'`))[0].name === file(A, 'png'));
check('(clean up)', (await qa(`delete from storage.objects where name = $1 returning id`, [file(A, 'png')])).length === 1);

// The file pasted into the Supabase SQL Editor (supabase/archive-step-2.sql) runs on a migrated database, twice, and changes nothing that the tests below rely on.
{
  const paste = readFileSync(new URL('../archive-step-2.sql', import.meta.url), 'utf8');
  let ok = true;
  try { await db.exec(paste); await db.exec(paste); } catch (e) { ok = false; console.log(String(e)); }
  check('archive-step-2.sql runs twice without errors', ok);
}

// Archive (20261008000100_archive_items.sql)
{
const arch = async (kind, id, q = qa) => (await q('select archive_delete($1, $2) as id', [kind, id]))[0].id;
const restore = async (id, q = qa) => (await q('select archive_restore($1) as r', [id]))[0].r;
const entry = async (id, q = qa) => (await q('select kind, title, detail, related from archive_items where id = $1', [id]))[0];
const one = async (sql, params, q = qa) => (await q(sql, params))[0];
const count = async (table, id, q = qa) => (await q(`select count(*)::int n from ${table} where id = $1`, [id]))[0].n;

// a task: archived with its category and project, restored with the same id and links
const cat = (await one(`insert into categories (name, color) values ('Arch cat', 'blue') returning id`)).id;
const proj = (await one(`insert into projects (name) values ('Arch project') returning id`)).id;
const task = (await one(`insert into tasks (title, category_id, project_id, due_date) values ('Archive me', $1, $2, '2026-10-20') returning id`, [cat, proj])).id;
const a1 = await arch('task', task);
const e1 = await entry(a1);
check('deleting a task moves it to the Archive', (await count('tasks', task)) === 0 && e1.kind === 'task' && e1.title === 'Archive me' && e1.detail === '2026-10-20' && e1.related === 0, JSON.stringify(e1));
const r1 = await restore(a1);
const t1 = await one('select category_id, project_id, due_date::text d from tasks where id = $1', [task]);
check('restoring brings the task back with the same id and its links', r1.kind === 'task' && r1.id === task && r1.title === 'Archive me' && t1.category_id === cat && t1.project_id === proj && t1.d === '2026-10-20', JSON.stringify(t1));
check('a restored item leaves the Archive', (await count('archive_items', a1)) === 0);
await expectError('restoring the same entry twice says it is not there', () => restore(a1), 'Not found');

// links to things deleted in the meantime are cleared, not an error
const a2 = await arch('task', task);
await qa('delete from categories where id = $1', [cat]);
await restore(a2);
const t2 = await one('select category_id, project_id from tasks where id = $1', [task]);
check('a task restored after its category was deleted comes back uncategorised', t2.category_id === null && t2.project_id === proj, JSON.stringify(t2));

// a goal takes its milestones with it and brings them back
const goal = (await one(`insert into goals (title, status) values ('Arch goal', 'behind') returning id`)).id;
const ms = (await qa(`insert into goal_milestones (goal_id, title, position) values ($1, 'M1', 1), ($1, 'M2', 2), ($1, 'M3', 3) returning id`, [goal])).map((m) => m.id);
const ag = await arch('goal', goal);
const eg = await entry(ag);
check('deleting a goal archives it with its milestones', (await count('goals', goal)) === 0 && (await qa('select id from goal_milestones where goal_id = $1', [goal])).length === 0 && eg.related === 3 && eg.detail === 'behind', JSON.stringify(eg));
await restore(ag);
const back = await qa('select id from goal_milestones where goal_id = $1 order by position', [goal]);
check('restoring a goal brings its milestones back with the same ids', back.map((m) => m.id).join() === ms.join());

// a milestone alone needs its goal
const am = await arch('milestone', ms[0]);
check('a milestone can be archived and restored on its own', (await count('goal_milestones', ms[0])) === 0 && (await restore(am)).id === ms[0] && (await count('goal_milestones', ms[0])) === 1);
const am2 = await arch('milestone', ms[1]);
const ag2 = await arch('goal', goal);
await expectError('a milestone cannot come back before its goal', () => restore(am2), 'Restore the goal from the Archive first');
await restore(ag2);
check('after the goal is restored the milestone can follow', (await restore(am2)).id === ms[1]);

// a course: units and topics
const course = (await one(`insert into courses (title, start_date, target_date, weekly_plan) values ('Arch course', '2026-10-05', '2026-12-28', '{4,6.5}') returning id`)).id;
const unit = (await one(`insert into course_units (course_id, code, title) values ($1, '1', 'U1') returning id`, [course])).id;
const topics = (await qa(`insert into course_topics (course_id, unit_id, code, title, est_hours, status, actual_hours) values ($1, $2, '1.1', 'T1', 2, 'done', 1.5), ($1, $2, '1.2', 'T2', 3, 'not-started', 0) returning id`, [course, unit])).map((t) => t.id);
const ac = await arch('course', course);
check('deleting a course archives it with its units and topics', (await count('courses', course)) === 0 && (await count('course_units', unit)) === 0 && (await qa('select id from course_topics where course_id = $1', [course])).length === 0 && (await entry(ac)).related === 3);
await restore(ac);
const ct = await qa('select code, status, actual_hours::float h from course_topics where course_id = $1 order by code', [course]);
const cc = await one('select weekly_plan::text w, target_date::text t from courses where id = $1', [course]);
check('a restored course has its units, topics, progress and plan', (await count('course_units', unit)) === 1 && ct.length === 2 && ct[0].status === 'done' && ct[0].h === 1.5 && cc.w === '{4.00,6.50}' && cc.t === '2026-12-28', JSON.stringify({ ct, cc }));
const at = await arch('topic', topics[0]);
const au = await arch('unit', unit);
await expectError('a topic cannot come back before its unit', () => restore(at), 'Restore the');
await restore(au);
check('unit restored with its remaining topic, then the other topic follows', (await count('course_topics', topics[1])) === 1 && (await restore(at)).id === topics[0]);

// a habit keeps its history
const habit = (await one(`insert into habits (name) values ('Arch habit') returning id`)).id;
await qa(`insert into habit_logs (habit_id, log_date) values ($1, '2026-10-01'), ($1, '2026-10-02')`, [habit]);
const ah = await arch('habit', habit);
check('deleting a habit archives it with its history', (await count('habits', habit)) === 0 && (await entry(ah)).related === 2);
await restore(ah);
check('a restored habit has its history', (await qa('select 1 from habit_logs where habit_id = $1', [habit])).length === 2);

// categories only lose their links to others: restoring links them again
const c2 = (await one(`insert into categories (name, color) values ('Arch cat 2', 'rose') returning id`)).id;
const tA = (await one(`insert into tasks (title, category_id) values ('In cat', $1) returning id`, [c2])).id;
const tB = (await one(`insert into tasks (title, category_id) values ('In cat too', $1) returning id`, [c2])).id;
const evt = (await one(`insert into events (title, event_date, all_day, category_id) values ('Evt in cat', '2026-10-10', true, $1) returning id`, [c2])).id;
const ac2 = await arch('category', c2);
check('deleting a category leaves its tasks and events uncategorised', (await one('select category_id from tasks where id = $1', [tA])).category_id === null && (await one('select category_id from events where id = $1', [evt])).category_id === null);
await qa('update tasks set category_id = (select id from categories limit 1) where id = $1', [tB]); // linked to something else since: must stay
await restore(ac2);
check('restoring a category links its tasks and events again', (await one('select category_id from tasks where id = $1', [tA])).category_id === c2 && (await one('select category_id from events where id = $1', [evt])).category_id === c2);
check('…but not ones that were moved to another category meanwhile', (await one('select category_id from tasks where id = $1', [tB])).category_id !== c2);
const ac3 = await arch('category', c2);
await qa(`insert into categories (name, color) values ('Arch cat 2', 'blue')`);
await expectError('restoring a name that is taken again gives a clear message', () => restore(ac3), 'same name');
check('…and the entry stays in the Archive', (await count('archive_items', ac3)) === 1);

// finance: a budget category and its transactions and bills
const bc = (await one(`insert into budget_categories (name) values ('Arch budget') returning id`)).id;
const tx = (await one(`insert into transactions (type, amount, budget_category_id, description, tx_date) values ('expense', 450, $1, 'Lunch', '2026-10-02') returning id`, [bc])).id;
const bill = (await one(`insert into bills (name, amount, budget_category_id, due_date) values ('Arch bill', 99, $1, '2026-10-30') returning id`, [bc])).id;
const abc = await arch('budget_category', bc);
check('deleting a budget category keeps its transactions and bills, without a category', (await one('select budget_category_id from transactions where id = $1', [tx])).budget_category_id === null && (await one('select budget_category_id from bills where id = $1', [bill])).budget_category_id === null);
await restore(abc);
check('restoring it links its transactions and bills again', (await one('select budget_category_id from transactions where id = $1', [tx])).budget_category_id === bc && (await one('select budget_category_id from bills where id = $1', [bill])).budget_category_id === bc);
const atx = await arch('transaction', tx);
const etx = await entry(atx);
check('a transaction is labelled by its description and what it was', etx.title === 'Lunch' && etx.detail === 'expense 450.00', JSON.stringify(etx));
await restore(atx);
check('a restored transaction keeps its category', (await one('select budget_category_id from transactions where id = $1', [tx])).budget_category_id === bc);
const abill = await arch('bill', bill);
check('a bill can be archived and restored', (await restore(abill)).id === bill && (await count('bills', bill)) === 1);

// a paid bill keeps its link to the transaction through delete and restore
const paidTx = (await one(`insert into transactions (type, amount, description, tx_date) values ('expense', 99, 'Paid arch bill', '2026-10-03') returning id`)).id;
await qa('update bills set transaction_id = $1, paid_at = now() where id = $2', [paidTx, bill]);
const apaid = await arch('transaction', paidTx);
check('deleting a transaction clears its paid bill link', (await one('select transaction_id from bills where id = $1', [bill])).transaction_id === null);
await restore(apaid);
check('restoring the transaction links its paid bill again', (await one('select transaction_id from bills where id = $1', [bill])).transaction_id === paidTx);

// a delete that removes nothing (another tab got there first) leaves no entry behind
await db.exec(`create function public.test_skip_delete() returns trigger language plpgsql as $$ begin return null; end $$;
  create trigger test_skip_delete before delete on public.notes for each row execute function public.test_skip_delete();`);
const raced = (await one(`insert into notes (title) values ('Raced note') returning id`)).id;
await expectError('a delete that removed nothing is refused', () => arch('note', raced), 'Not found');
check('…and leaves no entry in the Archive, and the note is still there', (await qa(`select id from archive_items where title = 'Raced note'`)).length === 0 && (await count('notes', raced)) === 1);
await db.exec(`drop trigger test_skip_delete on public.notes; drop function public.test_skip_delete();`);

// the simple ones
for (const [kind, sql, titleOf] of [
  ['note', `insert into notes (title, body) values ('Arch note', 'text') returning id`, 'Arch note'],
  ['event', `insert into events (title, event_date, all_day) values ('Arch event', '2026-10-12', true) returning id`, 'Arch event'],
  ['reminder', `insert into reminders (text) values ('Arch reminder') returning id`, 'Arch reminder'],
  ['study_block', `insert into study_blocks (week_start, weekday, hours, activity) values ('2026-10-05', 2, 1.5, 'Arch study') returning id`, 'Arch study'],
  ['job', `insert into job_applications (url, title, company) values ('https://example.com/j', 'Arch job', 'Acme') returning id`, 'Arch job'],
]) {
  const table = { note: 'notes', event: 'events', reminder: 'reminders', study_block: 'study_blocks', job: 'job_applications' }[kind];
  const id = (await one(sql)).id;
  const entryId = await arch(kind, id);
  const e = await entry(entryId);
  const gone = (await count(table, id)) === 0;
  const same = (await restore(entryId)).id === id && (await count(table, id)) === 1;
  check(`a ${kind.replace('_', ' ')} goes to the Archive and comes back`, gone && e.kind === kind && e.title === titleOf && same, JSON.stringify(e));
}

// privacy and misuse
const bTask = (await one(`insert into tasks (title) values ('Only B') returning id`, [], qb)).id;
await expectError("user A cannot archive B's task", () => arch('task', bTask), 'Not found');
const bEntry = await arch('task', bTask, qb);
check("user A cannot see B's Archive", (await qa('select id from archive_items where id = $1', [bEntry])).length === 0);
await expectError("user A cannot restore B's entry", () => restore(bEntry), 'Not found');
check("user A cannot delete B's entry for good", (await qa('delete from archive_items where id = $1 returning id', [bEntry])).length === 0);
await expectError('an unknown kind is refused', () => arch('profile', A), 'Unknown kind');
await expectError('a signed-out visitor cannot archive', () => qanon('select archive_delete($1, $2)', ['task', bTask]), 'permission denied');
await expectError('a signed-out visitor cannot read the Archive', () => qanon('select * from archive_items'), 'permission denied');
await expectError('the Archive cannot be edited in place', () => qa(`update archive_items set title = 'x'`), 'permission denied');
await expectError('the Archive cannot be filled by hand with another kind', () => qa(`insert into archive_items (kind, title, data) values ('profile', 'x', '{}')`), 'check constraint');

// deleting for good
const note2 = (await one(`insert into notes (title) values ('Gone for good') returning id`)).id;
const an2 = await arch('note', note2);
check('deleting from the Archive removes the entry for good', (await qa('delete from archive_items where id = $1 returning id', [an2])).length === 1 && (await count('notes', note2)) === 0 && (await count('archive_items', an2)) === 0);
await expectError('an entry deleted for good cannot be restored', () => restore(an2), 'Not found');

// Learning library (20261009000000_learning_resources.sql)
const lc = (await one(`insert into courses (title, start_date, target_date) values ('Digital Marketing', '2026-10-05', '2026-12-28') returning id`)).id;
const lu = (await one(`insert into course_units (course_id, code, title) values ($1, '1', 'SEO') returning id`, [lc])).id;
const res = await one(`insert into learning_resources (title, course_id, unit_id, url) values ('SEO Basics', $1, $2, 'https://www.coursera.org/learn/seo') returning id, kind, status, priority, est_hours::float h, items_total, items_done, skills, rating, cost::float c`, [lc, lu]);
check('a library item saves with defaults', res.kind === 'certificate' && res.status === 'todo' && res.priority === 'medium' && res.h === 0 && res.items_total === 0 && res.items_done === 0 && res.skills.length === 0 && res.rating === null && res.c === 0, JSON.stringify(res));
const quarter = await one(`insert into learning_resources (title, est_hours, cost) values ('Quarter', 7.75, 1200.5) returning est_hours::float h, cost::float c`);
check('quarter hours and prices are kept', quarter.h === 7.75 && quarter.c === 1200.5);
await expectError('empty title rejected', () => qa(`insert into learning_resources (title) values ('')`), 'check constraint');
await expectError('unknown kind rejected', () => qa(`insert into learning_resources (title, kind) values ('x', 'movie')`), 'check constraint');
await expectError('unknown status rejected', () => qa(`insert into learning_resources (title, status) values ('x', 'lost')`), 'check constraint');
await expectError('unknown priority rejected', () => qa(`insert into learning_resources (title, priority) values ('x', 'urgent')`), 'check constraint');
await expectError('rating must be 1 to 5', () => qa(`insert into learning_resources (title, rating) values ('x', 6)`), 'check constraint');
await expectError('watched cannot be more than the total', () => qa(`insert into learning_resources (title, items_total, items_done) values ('x', 5, 6)`), 'check constraint');
await expectError('watched without a total rejected', () => qa(`insert into learning_resources (title, items_done) values ('x', 1)`), 'check constraint');
await expectError('a certificate cannot expire before it was issued', () => qa(`insert into learning_resources (title, issued_on, expires_on) values ('x', '2026-10-01', '2026-09-01')`), 'check constraint');
const listed = await one(`insert into learning_resources (title, status, items_total, items_done, certificate_id, issued_on, expires_on, skills) values ('Done one', 'completed', 10, 10, 'ABC123', '2026-10-01', '2027-10-01', '{SEO,GA4}') returning id, skills`);
check('a completed item with a certificate and skills saves', listed.skills.join() === 'SEO,GA4');
const stamped2 = await one(`update learning_resources set title = 'SEO Basics 2' where id = $1 returning updated_at > created_at as moved`, [res.id]);
check('library "last edited" time updates', stamped2.moved === true);

check("user B sees none of A's library", (await qb('select count(*)::int n from learning_resources'))[0].n === 0);
check("user B cannot update A's item", (await qb(`update learning_resources set title = 'hacked' where id = $1 returning id`, [res.id])).length === 0);
check("user B cannot delete A's item", (await qb('delete from learning_resources where id = $1 returning id', [res.id])).length === 0);
await expectError('user B cannot insert an item for A', () => qb(`insert into learning_resources (user_id, title) values ($1, 'x')`, [A]), 'row-level security');
await expectError('signed-out visitor cannot read the library', () => qanon('select * from learning_resources'), 'permission denied');

// Deleting a course (to the Archive) keeps the items, without the link; restoring the course links them again.
const arcCourse = await arch('course', lc);
const kept = await one('select course_id, unit_id from learning_resources where id = $1', [res.id]);
check('deleting a course keeps its library items, unlinked', (await count('courses', lc)) === 0 && kept.course_id === null && kept.unit_id === null, JSON.stringify(kept));
await restore(arcCourse);
const linked = await one('select course_id, unit_id from learning_resources where id = $1', [res.id]);
// (A course's units are deleted with it, so the items lose the unit as well; only the course link comes back.)
check('restoring the course links its items to it again', linked.course_id === lc && linked.unit_id === null, JSON.stringify(linked));
await qa('update learning_resources set unit_id = $1 where id = $2', [lu, res.id]);

// A deleted unit only clears the unit link.
const arcUnit = await arch('unit', lu);
const afterUnit = await one('select course_id, unit_id from learning_resources where id = $1', [res.id]);
check('deleting a unit keeps the item in its course', afterUnit.course_id === lc && afterUnit.unit_id === null, JSON.stringify(afterUnit));
await restore(arcUnit);
check('restoring the unit links the item to it again', (await one('select unit_id from learning_resources where id = $1', [res.id])).unit_id === lu);

// An item's unit always belongs to its course.
const lc2 = (await one(`insert into courses (title, start_date, target_date) values ('Other course', '2026-10-05', '2026-12-28') returning id`)).id;
await qa('update learning_resources set course_id = $1 where id = $2', [lc2, res.id]);
check('moving an item to another course drops its old unit', (await one('select course_id, unit_id from learning_resources where id = $1', [res.id])).unit_id === null);
const mismatch = await one(`insert into learning_resources (title, course_id, unit_id) values ('Mismatch', $1, $2) returning unit_id`, [lc2, lu]);
check('a unit of another course is not accepted on a new item', mismatch.unit_id === null);
await qa('update learning_resources set course_id = $1, unit_id = $2 where id = $3', [lc, lu, res.id]);
const arcUnit2 = await arch('unit', lu);
await qa('update learning_resources set course_id = $1 where id = $2', [lc2, res.id]);
await restore(arcUnit2);
check('restoring a unit does not attach an item that has moved to another course', (await one('select course_id, unit_id from learning_resources where id = $1', [res.id])).unit_id === null);
await qa('update learning_resources set course_id = $1 where id = $2', [lc, res.id]);

// An item goes to the Archive and comes back with everything (certificate, skills, dates, links).
const arcItem = await arch('resource', listed.id);
const eItem = await entry(arcItem);
check('deleting an item moves it to the Archive', (await count('learning_resources', listed.id)) === 0 && eItem.kind === 'resource' && eItem.title === 'Done one', JSON.stringify(eItem));
await restore(arcItem);
const backItem = await one(`select status, items_done, certificate_id, issued_on::text i, expires_on::text e, skills from learning_resources where id = $1`, [listed.id]);
check('a restored item has its certificate, dates and skills', backItem.status === 'completed' && backItem.items_done === 10 && backItem.certificate_id === 'ABC123' && backItem.i === '2026-10-01' && backItem.e === '2027-10-01' && backItem.skills.join() === 'SEO,GA4', JSON.stringify(backItem));

// A practice project is only a link: deleting the project keeps the item.
const practice = (await one(`insert into projects (name) values ('Practice: SEO') returning id`)).id;
await qa('update learning_resources set practice_project_id = $1 where id = $2', [practice, res.id]);
await qa('delete from projects where id = $1', [practice]);
check('deleting the practice project keeps the item', (await one('select practice_project_id from learning_resources where id = $1', [res.id])).practice_project_id === null);
}

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
