"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCheck, NotebookPen } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { formatDate, addDays } from "@/lib/dates";
import { hm, plural } from "@/lib/format";
import type { LearningWeek } from "@/lib/types";
import { useSaveLater } from "@/lib/use-save-later";
import { useFeedback } from "@/components/ui/feedback";

/** The week in review: hours against the goal, what was finished, what is late, and one line about how it went. */
export function WeekReview({ data }: { data: LearningWeek }) {
  const review = data.review;
  const { toast } = useFeedback();
  const saveLater = useSaveLater(800);
  const [text, setText] = useState(review?.reflection ?? "");
  if (!review) return null; // a copy saved before this existed: shown once the fresh answer arrives

  const done = data.blocks.filter((b) => b.done).reduce((sum, b) => sum + Number(b.hours), 0);
  const goal = Number(data.goal_hours);
  const weekStart = data.week_start;

  const change = (value: string) => {
    setText(value);
    saveLater(`reflection-${weekStart}`, () => {
      api(`/learning/week/${weekStart}`, { method: "PUT", body: { reflection: value.trim() } }).then(
        () => refresh("/learning"),
        (e) => toast(errorMessage(e), "error"),
      );
    });
  };

  return (
    <section className="card mt-5 p-5" aria-labelledby="review-title">
      <h2 id="review-title" className="card-title flex items-center gap-2">
        <NotebookPen className="size-5 text-violet-600" aria-hidden /> Week in review
        <span className="text-sm font-normal text-slate-500">{formatDate(weekStart, "short")} – {formatDate(addDays(weekStart, 6), "short")}</span>
      </h2>
      <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
        <li>
          <b className="font-semibold text-slate-900">{hm(done)}</b> studied of your {hm(goal)} goal{done >= goal ? ". Goal reached." : `: ${hm(goal - done)} short.`}
        </li>
        <li>
          {review.topics_done.length ? (
            <>
              <CheckCheck className="mr-1 inline size-4 text-emerald-600" aria-hidden />
              Finished {plural(review.topics_done.length, "topic")}:{" "}
              {review.topics_done.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ", "}
                  <Link href={`/learning/${t.course_id}`} className="text-blue-700 hover:underline">{t.code} {t.title}</Link>
                </span>
              ))}
            </>
          ) : (
            "No topic finished this week."
          )}
        </li>
        {review.items_done.length > 0 && (
          <li>
            Completed in the library: {review.items_done.map((r) => r.title).join(", ")}.
          </li>
        )}
        {review.late > 0 && (
          <li className="text-amber-700">{plural(review.late, "topic")} planned for earlier weeks {review.late === 1 ? "is" : "are"} still open. “Plan weeks” on the course page can carry {review.late === 1 ? "it" : "them"} over.</li>
        )}
      </ul>
      <label htmlFor="week-reflection" className="label mt-4 block">How did the week go? (one line)</label>
      <input id="week-reflection" className="input" maxLength={500} value={text} onChange={(e) => change(e.target.value)} placeholder="What worked, what to change next week" autoComplete="off" />
    </section>
  );
}
