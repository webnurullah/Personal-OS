// Hands-on practice: the practice plan for a finished course, and how far a skill has gone (learned, practised, proven). Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { daysBetween } from "../lib/dates.ts";
import { needsPractice, practiceLevel, skillLadder, type PracticeFacts } from "../lib/library.ts";
import { PRACTICE_SUBJECTS, practicePlan, subjectsFor } from "../lib/practice-templates.ts";
import { ProjectCreate, TaskCreate } from "../lib/server/schemas.ts";
import type { LearningResource } from "../lib/types.ts";

const today = "2026-10-08";

test("every practice plan has 6 to 8 tasks, one after another, all within 3 weeks", () => {
  const titles = [
    "SEO Basics", "Google Ads Search certification", "Facebook ads tutorial", "Email marketing", "Google Analytics 4", "Content writing",
    "WordPress website from scratch", "JavaScript full course", "SQL for data analysis", "Excel skills for business", "Canva for beginners",
    "Video editing for beginners", "Spoken English practice", "Freelancing for beginners", "Project management foundations", "A course nobody has a template for",
  ];
  for (const title of titles) {
    const plan = practicePlan({ title, skills: [] }, today);
    assert.ok(plan.tasks.length >= 6 && plan.tasks.length <= 8, `${title}: ${plan.tasks.length} tasks`);
    const days = plan.tasks.map((t) => daysBetween(today, t.due_date));
    for (let i = 1; i < days.length; i++) assert.ok(days[i] > days[i - 1], `${title}: days ${days.join()}`);
    assert.ok(days[0] >= 1 && days.at(-1)! <= 21, `${title}: days ${days.join()}`);
    assert.equal(plan.project.start_date, today);
    assert.equal(plan.project.due_date, plan.tasks.at(-1)!.due_date);
  }
});

test("a plan always starts with redoing it and ends with the profile, with the proof steps in between", () => {
  const { tasks } = practicePlan({ title: "SEO Basics", skills: ["SEO"] }, today);
  assert.match(tasks[0].title, /^Redo one exercise from “SEO Basics”/);
  assert.match(tasks.at(-1)!.title, /CV, LinkedIn and skills/);
  const text = tasks.map((t) => t.title).join("\n");
  for (const step of [/Publish your proof/, /Teach it back/, /feedback/]) assert.match(text, step);
});

test("the subject steps fit the course: by its skills, or by words in its title", () => {
  const names = (item: { title: string; skills: string[] }) => subjectsFor(item).map((s) => s.name);
  assert.deepEqual(names({ title: "Anything", skills: ["SEO"] }), ["SEO"]);
  assert.deepEqual(names({ title: "Google Ads Search certification", skills: [] }).includes("Google Ads"), true);
  assert.equal(names({ title: "WordPress website from scratch", skills: [] }).includes("WordPress"), true);
  assert.equal(names({ title: "Intro to SQL", skills: [] }).includes("SQL"), true);
  assert.deepEqual(names({ title: "A course nobody has a template for", skills: [] }), []);
  // Whole words only: "excel" is not in "excellent", "react" is not in "reaction".
  assert.deepEqual(names({ title: "Excellent customer service", skills: [] }), []);
  assert.deepEqual(names({ title: "Reaction time training", skills: [] }), []);
  assert.deepEqual(names({ title: "Excel skills for business", skills: [] }), ["Excel & data"]);
  assert.equal(names({ title: "React for beginners", skills: [] })[0], "Web development");
  // The best match comes first: the Freelancing idea (which lists the skill Communication) gets the Freelancing steps, not the Speaking ones.
  assert.deepEqual(names({ title: "Freelancing for beginners: profile, gigs and proposals", skills: ["Communication"] }), ["Freelancing", "Speaking & English"]);
  assert.match(practicePlan({ title: "Freelancing for beginners: profile, gigs and proposals", skills: ["Communication"] }, today).tasks[1].title, /profile and one service/);
  // A key in the title beats a skill: this is about speaking, with one SEO mention in the skills.
  assert.equal(names({ title: "Presentation and public speaking", skills: ["SEO"] })[0], "Speaking & English");
  // The SEO plan has SEO-specific tasks; an unknown course gets the general "apply it" step.
  assert.match(practicePlan({ title: "x", skills: ["SEO"] }, today).tasks.map((t) => t.title).join("\n"), /SEO checklist/);
  assert.match(practicePlan({ title: "A course nobody has a template for", skills: [] }, today).tasks[1].title, /Apply it to one small real problem/);
  // At most 3 subject steps, however many subjects match.
  assert.equal(practicePlan({ title: "SEO, Google Ads and Facebook ads", skills: ["SEO", "Google Ads", "Facebook Ads"] }, today).tasks.length, 8);
});

test("every subject template has 1 to 3 steps with a title and a note", () => {
  for (const subject of PRACTICE_SUBJECTS) {
    assert.ok(subject.steps.length >= 1 && subject.steps.length <= 3, subject.name);
    assert.ok(subject.keys.length > 0 && subject.goal.length > 0, subject.name);
    for (const step of subject.steps) assert.ok(step.title.length > 10 && step.title.length <= 200 && step.notes.length > 10, `${subject.name}: ${step.title}`);
  }
});

test("the plan fits what the Projects and Tasks endpoints accept", () => {
  const plan = practicePlan({ title: "A very long course title ".repeat(30), skills: ["SEO"], takeaway: "I can audit a website" }, today);
  assert.equal(ProjectCreate.safeParse(plan.project).success, true, JSON.stringify(ProjectCreate.safeParse(plan.project)));
  for (const task of plan.tasks) assert.equal(TaskCreate.safeParse(task).success, true, task.title);
  assert.ok(plan.project.name.length <= 120);
  assert.equal(plan.project.goal, "I can audit a website"); // the person's own words win
  assert.match(practicePlan({ title: "SEO Basics", skills: ["SEO"] }, today).project.goal, /^Use what I learned in “SEO Basics” to improve a real website/);
});

const item = (over: Partial<LearningResource> = {}) => ({ status: "completed", certificate_url: "", certificate_id: "", ...over }) as LearningResource;
const project = (over: Partial<PracticeFacts> = {}): PracticeFacts => ({ status: "active", tasks_total: 6, tasks_done: 0, archived_at: null, links: [], ...over });

test("a skill is learned, practised (half the project done) or proven (all done with proof)", () => {
  assert.equal(practiceLevel(item()), "learned"); // no practice project
  assert.equal(practiceLevel(item(), project()), "learned");
  assert.equal(practiceLevel(item(), project({ tasks_done: 2 })), "learned");
  assert.equal(practiceLevel(item(), project({ tasks_done: 3 })), "practised");
  assert.equal(practiceLevel(item(), project({ tasks_done: 6 })), "practised"); // finished but no proof
  assert.equal(practiceLevel(item(), project({ tasks_done: 6, links: [{ url: "https://example.com/work" }] })), "proven");
  assert.equal(practiceLevel(item({ certificate_id: "ABC" }), project({ tasks_done: 6 })), "proven"); // a certificate counts as proof
  assert.equal(practiceLevel(item(), project({ status: "done", tasks_done: 4, links: [{ url: "https://x.com" }] })), "proven");
  assert.equal(practiceLevel(item(), project({ tasks_done: 6, links: [{ url: "https://x.com" }], archived_at: "2026-10-01T00:00:00Z" })), "learned"); // archived
  assert.equal(practiceLevel(item(), project({ tasks_total: 0 })), "learned");
  assert.equal(practiceLevel(item(), null), "learned");
});

test("the skill ladder keeps the highest level of each skill, ignores unfinished items, and lists proven first", () => {
  const items = [
    item({ id: "a", skills: ["SEO", "Google Analytics"], practice_project_id: "p1" }),
    item({ id: "b", skills: ["seo", "Excel"], practice_project_id: "p2" }),
    item({ id: "c", skills: ["SQL"], status: "learning" }),
    item({ id: "d", skills: ["Email Marketing"] }),
  ];
  const projects = new Map<string, PracticeFacts>([
    ["p1", project({ tasks_done: 3 })],
    ["p2", project({ tasks_done: 6, links: [{ url: "https://x.com" }] })],
  ]);
  assert.deepEqual(skillLadder(items, projects), [
    { skill: "SEO", level: "proven", items: 2 }, // the better of practised and proven
    { skill: "Excel", level: "proven", items: 1 },
    { skill: "Google Analytics", level: "practised", items: 1 },
    { skill: "Email Marketing", level: "learned", items: 1 },
  ]);
  assert.deepEqual(skillLadder([], new Map()), []);
});

test("an item is waiting for practice 3 days after it was completed, until it has a project", () => {
  const done = (completed_on: string | null, practice_project_id: string | null = null) => ({ status: "completed" as const, completed_on, practice_project_id });
  assert.equal(needsPractice(done("2026-10-05"), today), true); // 3 days ago
  assert.equal(needsPractice(done("2026-10-06"), today), false); // 2 days
  assert.equal(needsPractice(done("2026-10-05", "p1"), today), false);
  assert.equal(needsPractice(done(null), today), false);
  assert.equal(needsPractice({ status: "learning" as never, completed_on: "2026-09-01", practice_project_id: null }, today), false);
});
