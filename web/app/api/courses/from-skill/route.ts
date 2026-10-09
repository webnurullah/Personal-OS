import { handle } from "@/lib/server/api";
import { courseForSkill } from "@/lib/server/course-planning";
import { SkillCourseInput } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

// Job Apply: a small course for a skill you are missing, due by the nearest last date of the jobs that ask for it.
export const POST = handle(async ({ db, body, today, profile }) => {
  const input = parse(SkillCourseInput, await body());
  return courseForSkill(db, input, Number((await profile()).weekly_study_goal), await today());
}, { status: 201 });
