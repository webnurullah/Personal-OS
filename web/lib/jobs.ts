// Applications → Job Apply: which skills you have for each job, and what to learn across all of them.
import { daysBetween } from "./dates.ts";

type JobFacts = { id: string; title: string; status: string; deadline: string | null; skills: string[] };

/** "React.js", "react js" and "ReactJS" are the same skill. */
export const skillKey = (skill: string) => {
  const plain = skill.toLowerCase().replace(/[^a-z0-9+#]/g, "");
  // "JS" on its own has nothing left once ".js" is dropped: keep it as it is.
  return skill.toLowerCase().replace(/\.?js\b/g, "").replace(/[^a-z0-9+#]/g, "") || plain;
};

/**
 * Your skills plus new ones, without doubles ("React.js" is not added next to "React"). `added` is what was really new.
 * Used by Job Apply, Quick Add and a finished course in the Learning library.
 */
export function mergeSkills(have: string[], fresh: string[]) {
  const seen = new Set(have.map(skillKey));
  const added: string[] = [];
  for (const raw of fresh) {
    const skill = raw.trim();
    const key = skillKey(skill);
    if (!skill || !key || seen.has(key)) continue;
    seen.add(key);
    added.push(skill);
  }
  return { skills: [...have, ...added], added };
}

/** The job's skills split into the ones you have and the ones you don't, with a match percentage. */
export function skillMatch(jobSkills: string[], mySkills: string[]) {
  const mine = new Set(mySkills.map(skillKey));
  const have = jobSkills.filter((s) => mine.has(skillKey(s)));
  const missing = jobSkills.filter((s) => !mine.has(skillKey(s)));
  return { have, missing, percent: jobSkills.length ? Math.round((have.length / jobSkills.length) * 100) : 0 };
}

/**
 * Still alive: applied or in interviews, or saved with a last date that has not passed.
 * Rejected and offered jobs are finished, and a saved job past its last date is closed.
 */
export const isOpen = (job: JobFacts, today: string) => {
  if (["rejected", "offer"].includes(job.status)) return false;
  if (["applied", "interview"].includes(job.status)) return true;
  return !job.deadline || job.deadline >= today;
};

/** Match % of a job (for sorting and the CSV). */
export const matchPercent = (jobSkills: string[], mySkills: string[]) => skillMatch(jobSkills, mySkills).percent;

/** Skills you are missing across your open jobs, the most-wanted first (with the earliest last date, for a study deadline). */
export function skillsToLearn(jobs: JobFacts[], mySkills: string[], today: string) {
  const bySkill = new Map<string, { skill: string; jobs: string[]; by: string | null }>();
  for (const job of jobs.filter((j) => isOpen(j, today))) {
    for (const skill of skillMatch(job.skills, mySkills).missing) {
      const key = skillKey(skill);
      const entry = bySkill.get(key) ?? { skill, jobs: [], by: null };
      if (job.deadline && job.deadline >= today && (!entry.by || job.deadline < entry.by)) entry.by = job.deadline;
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
