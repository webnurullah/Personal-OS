// Reading job posts without AI. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { extractJob, htmlToText } from "../lib/job-extract.ts";
import { findSkills } from "../lib/skills.ts";

const today = "2026-10-06";

test("skills are found by whole word", () => {
  assert.deepEqual(findSkills("We use React.js, Node.js and PostgreSQL. Java is a plus."), ["React", "Node.js", "PostgreSQL", "Java"]);
  assert.deepEqual(findSkills("Strong JavaScript and TypeScript"), ["JavaScript", "TypeScript"]); // not "Java"
  assert.deepEqual(findSkills("NoSQL, MySQL and SQL Server"), ["MySQL", "SQL"]);
  assert.deepEqual(findSkills("Experience with C++ and C# and the .NET framework"), ["C++", "C#", ".NET"]);
  assert.deepEqual(findSkills("We rust nothing"), ["Rust"]);
  assert.deepEqual(findSkills("good communication and teamwork, MS Excel"), ["Communication", "Teamwork", "Excel"]);
});

const PAGE = `<html><head><title>Frontend Developer - Acme BD | Jobs</title>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Jobs"},
{"@type":"JobPosting","title":"Frontend Developer (React)","validThrough":"2026-10-20T23:59:00+06:00",
"hiringOrganization":{"@type":"Organization","name":"Acme BD"},
"jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"Dhaka","addressCountry":"BD"}},
"description":"&lt;p&gt;Build and maintain customer-facing web apps for our growing team across Bangladesh and beyond.&lt;/p&gt;&lt;h3&gt;Requirements&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;2+ years of experience with React and TypeScript&lt;/li&gt;&lt;li&gt;Good communication skills&lt;/li&gt;&lt;/ul&gt;&lt;h3&gt;Benefits&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;Lunch&lt;/li&gt;&lt;/ul&gt;"}]}</script>
</head><body><nav>Menu Excel</nav><h1>Frontend Developer</h1></body></html>`;

test("a page with JobPosting data", () => {
  const job = extractJob({ html: PAGE }, today);
  assert.equal(job.title, "Frontend Developer (React)");
  assert.equal(job.company, "Acme BD");
  assert.equal(job.location, "Dhaka, BD");
  assert.equal(job.deadline, "2026-10-20");
  assert.deepEqual(job.requirements, ["2+ years of experience with React and TypeScript", "Good communication skills"]);
  assert.deepEqual(job.skills, ["React", "TypeScript", "Communication"]); // "Excel" in the menu is ignored
  assert.match(job.summary, /^Build and maintain customer-facing web apps/);
});

test("a page without job data falls back to the title and the text", () => {
  const html = `<html><head><title>Sales Executive at Pixel Studio | BDJobs</title></head><body>
  <p>Pixel Studio is hiring a Sales Executive to grow our client base in Dhaka and Chattogram this year.</p>
  <h2>Job Requirements</h2><ul><li>Bachelor degree in any discipline</li><li>Negotiation and customer service skills</li></ul>
  <p>Application Deadline: Oct 25, 2026</p></body></html>`;
  const job = extractJob({ html }, today);
  assert.equal(job.title, "Sales Executive");
  assert.equal(job.company, "Pixel Studio");
  assert.equal(job.deadline, "2026-10-25");
  assert.deepEqual(job.requirements, ["Bachelor degree in any discipline", "Negotiation and customer service skills"]);
  assert.deepEqual([...job.skills].sort(), ["Customer Service", "Negotiation", "Sales"]);
});

test("pasted text", () => {
  const text = `Job Title: WordPress Developer
Company: Pixel Studio
Location: Dhaka (Gulshan)
We create and customise WordPress themes and plugins for agency clients, working with designers every day.
Requirements:
- 1 year of experience with WordPress and PHP
- Knowledge of HTML, CSS and JavaScript
Salary: Negotiable
Last date to apply: 20/11/2026`;
  const job = extractJob({ text }, today);
  assert.equal(job.title, "WordPress Developer");
  assert.equal(job.company, "Pixel Studio");
  assert.equal(job.location, "Dhaka (Gulshan)");
  assert.equal(job.deadline, "2026-11-20");
  assert.deepEqual(job.requirements, ["1 year of experience with WordPress and PHP", "Knowledge of HTML, CSS and JavaScript"]);
  assert.deepEqual(job.skills, ["WordPress", "PHP", "HTML", "CSS", "JavaScript"]);
});

test("no job found leaves the fields empty", () => {
  const job = extractJob({ text: "Please log in to continue." }, today);
  assert.equal(job.deadline, null);
  assert.deepEqual(job.skills, []);
  assert.deepEqual(job.requirements, []);
});

test("html to text keeps list items on their own lines", () => {
  assert.equal(htmlToText("<ul><li>One &amp; two</li><li>Three</li></ul><script>x()</script>"), "• One & two\n• Three");
});
