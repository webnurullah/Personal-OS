// A course turns "Done" by itself when all its topics are done and its certificates are completed.
import { courseFinished } from "../course.ts";
import { must } from "./http.ts";
import type { Db } from "./supabase.ts";

/** Marks the course Done when everything in it is finished. Never reopens a course (that stays a choice of yours). */
export async function completeCourseIfFinished(db: Db, courseId: string | null | undefined) {
  if (!courseId) return;
  const course = must(await db.from("courses").select("status").eq("id", courseId).maybeSingle());
  if (!course || course.status === "done") return;
  const topics = must(await db.from("course_topics").select("status").eq("course_id", courseId));
  const resources = must(await db.from("learning_resources").select("kind, status").eq("course_id", courseId));
  if (courseFinished(topics, resources)) must(await db.from("courses").update({ status: "done" }).eq("id", courseId).select("id"));
}
