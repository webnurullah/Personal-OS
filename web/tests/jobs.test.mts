// Job Apply: skill matching and what to learn. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { compareJobs, deadlineLabel, isOpen, skillKey, skillMatch, skillsToLearn, sortJobs } from "../lib/jobs.ts";

const today = "2026-10-06";
const job = (id: string, skills: string[], deadline: string | null = null, status = "saved") => ({ id, title: `Job ${id}`, status, deadline, skills });

test("skill names match however they are written", () => {
  assert.equal(skillKey("React.js"), skillKey("ReactJS"));
  assert.equal(skillKey("react js"), skillKey("React"));
  assert.notEqual(skillKey("C++"), skillKey("C#"));
  assert.notEqual(skillKey("Java"), skillKey("JavaScript"));
  assert.equal(skillKey("JS"), "js"); // not empty
  assert.notEqual(skillKey("JS"), skillKey("TS"));
  assert.equal(skillKey("Node.js"), "node");
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

// ---------- the order of the job list: starred first, then saved, then applied ----------
const listed = (id: string, status: string, over: Record<string, unknown> = {}) => ({ id, status, favourite: false, deadline: null as string | null, applied_on: null as string | null, created_at: "2026-10-01T00:00:00Z", ...over });
const ids = (jobs: { id: string }[]) => jobs.map((j) => j.id).join(" ");

test("saved jobs come first, the ones you applied for go below", () => {
  const sorted = sortJobs([listed("applied", "applied"), listed("saved", "saved"), listed("interview", "interview"), listed("rejected", "rejected"), listed("offer", "offer")]);
  assert.equal(ids(sorted), "saved applied interview offer rejected");
});

test("a starred job is listed first, even before saved jobs, whatever its stage", () => {
  const sorted = sortJobs([listed("saved1", "saved", { deadline: "2026-10-09" }), listed("star-applied", "applied", { favourite: true }), listed("saved2", "saved"), listed("star-saved", "saved", { favourite: true, deadline: "2026-12-01" })]);
  assert.equal(ids(sorted), "star-saved star-applied saved1 saved2", "starred first (saved before applied among them), then the others");
});

test("inside a stage: saved by the nearest last date (no date last), applied by the latest applied first, then the newest", () => {
  const saved = sortJobs([listed("none", "saved"), listed("late", "saved", { deadline: "2026-11-30" }), listed("soon", "saved", { deadline: "2026-10-12" }), listed("soon-newer", "saved", { deadline: "2026-10-12", created_at: "2026-10-05T00:00:00Z" })]);
  assert.equal(ids(saved), "soon-newer soon late none");
  const applied = sortJobs([listed("none", "applied"), listed("old", "applied", { applied_on: "2026-09-20" }), listed("new", "applied", { applied_on: "2026-10-04" })]);
  assert.equal(ids(applied), "new old none");
});

test("sorting does not change the list you give it, and an unknown status goes last", () => {
  const input = [listed("b", "applied"), listed("a", "saved"), listed("x", "mystery")];
  const copy = [...input];
  assert.equal(ids(sortJobs(input)), "a b x");
  assert.deepEqual(input, copy);
  assert.equal(compareJobs(listed("a", "saved"), listed("a", "saved")), 0);
});
