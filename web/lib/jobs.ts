// Applications → Job Apply: which skills you have for each job, and what to learn across all of them.
import { daysBetween } from "./dates.ts";

type JobFacts = { id: string; title: string; status: string; deadline: string | null; skills: string[] };

/** "React.js", "react js" and "ReactJS" are the same skill. */
export const skillKey = (skill: string) => skill.toLowerCase().replace(/\.?js\b/g, "").replace(/[^a-z0-9+#]/g, "");

/** The job's skills split into the ones you have and the ones you don't, with a match percentage. */
export function skillMatch(jobSkills: string[], mySkills: string[]) {
  const mine = new Set(mySkills.map(skillKey));
  const have = jobSkills.filter((s) => mine.has(skillKey(s)));
  const missing = jobSkills.filter((s) => !mine.has(skillKey(s)));
  return { have, missing, percent: jobSkills.length ? Math.round((have.length / jobSkills.length) * 100) : 0 };
}

/** Still worth applying to: not rejected or offered, and the last date has not passed. */
export const isOpen = (job: JobFacts, today: string) => !["rejected", "offer"].includes(job.status) && (!job.deadline || job.deadline >= today);

/** Skills you are missing across your open jobs, the most-wanted first. */
export function skillsToLearn(jobs: JobFacts[], mySkills: string[], today: string) {
  const bySkill = new Map<string, { skill: string; jobs: string[] }>();
  for (const job of jobs.filter((j) => isOpen(j, today))) {
    for (const skill of skillMatch(job.skills, mySkills).missing) {
      const key = skillKey(skill);
      const entry = bySkill.get(key) ?? { skill, jobs: [] };
      if (!entry.jobs.includes(job.title)) entry.jobs.push(job.title);
      bySkill.set(key, entry);
    }
  }
  return [...bySkill.values()].sort((a, b) => b.jobs.length - a.jobs.length || a.skill.localeCompare(b.skill));
}

/** "5 days left", "Last day today", "Closed 2 days ago", or "" when there is no deadline. */
export function deadlineLabel(deadline: string | null, today: string) {
  if (!deadline) return "";
  const days = daysBetween(today, deadline);
  if (days > 1) return `${days} days left`;
  if (days === 1) return "Last day tomorrow";
  if (days === 0) return "Last day today";
  return days === -1 ? "Closed yesterday" : `Closed ${-days} days ago`;
}
