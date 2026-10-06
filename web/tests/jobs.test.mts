// Job Apply: skill matching and what to learn. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { deadlineLabel, isOpen, skillKey, skillMatch, skillsToLearn } from "../lib/jobs.ts";

const today = "2026-10-06";
const job = (id: string, skills: string[], deadline: string | null = null, status = "saved") => ({ id, title: `Job ${id}`, status, deadline, skills });

test("skill names match however they are written", () => {
  assert.equal(skillKey("React.js"), skillKey("ReactJS"));
  assert.equal(skillKey("react js"), skillKey("React"));
  assert.notEqual(skillKey("C++"), skillKey("C#"));
  assert.notEqual(skillKey("Java"), skillKey("JavaScript"));
});

test("a job's skills split into have and missing", () => {
  const m = skillMatch(["React", "SQL", "Docker", "Communication"], ["react.js", "communication"]);
  assert.deepEqual(m.have, ["React", "Communication"]);
  assert.deepEqual(m.missing, ["SQL", "Docker"]);
  assert.equal(m.percent, 50);
  assert.equal(skillMatch([], ["React"]).percent, 0);
});

test("closed, rejected and offered jobs are not open", () => {
  assert.equal(isOpen(job("a", [], "2026-10-06"), today), true);
  assert.equal(isOpen(job("a", [], "2026-10-05"), today), false);
  assert.equal(isOpen(job("a", [], null, "rejected"), today), false);
  assert.equal(isOpen(job("a", [], null, "applied"), today), true);
  assert.equal(isOpen(job("a", [], "2026-10-01", "applied"), today), true); // applied: the last date no longer matters
  assert.equal(isOpen(job("a", [], "2026-10-01", "interview"), today), true);
});

test("skills to learn: most-wanted first, open jobs only", () => {
  const jobs = [
    job("1", ["React", "Docker", "SQL"]),
    job("2", ["Docker", "AWS"], "2026-10-20"),
    job("3", ["Kubernetes"], "2026-10-01"), // closed
  ];
  const list = skillsToLearn(jobs, ["React"], today);
  assert.deepEqual(list.map((s) => [s.skill, s.jobs.length]), [["Docker", 2], ["AWS", 1], ["SQL", 1]]);
  assert.equal(list[0].by, "2026-10-20"); // the earliest last date among the jobs that ask for it
  assert.equal(list[2].by, null);
});

test("deadline labels", () => {
  assert.equal(deadlineLabel(null, today), "");
  assert.equal(deadlineLabel("2026-10-11", today), "5 days left");
  assert.equal(deadlineLabel("2026-10-07", today), "Last day tomorrow");
  assert.equal(deadlineLabel("2026-10-06", today), "Last day today");
  assert.equal(deadlineLabel("2026-10-04", today), "Closed 2 days ago");
});
