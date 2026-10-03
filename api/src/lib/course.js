const { daysBetween } = require('./dates');
const { dbError } = require('./http');

/**
 * Hours of work finished on a topic: all of it once completed,
 * otherwise the time spent so far (never more than the estimate).
 * @param {{ status: string; est_hours: number; actual_hours: number }} topic
 */
function doneHours(topic) {
  return topic.status === 'done' ? Number(topic.est_hours) : Math.min(Number(topic.actual_hours), Number(topic.est_hours));
}

/** @param {number} n */
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Short progress summary for each course (used by the Learning page and the course list).
 * @param {import('../supabase').Db} db
 * @param {string} today
 */
async function courseSummaries(db, today) {
  const [courses, topics] = await Promise.all([
    db.from('courses').select('id, title, subtitle, start_date, target_date, color').order('created_at'),
    db.from('course_topics').select('course_id, unit_id, est_hours, actual_hours, status'),
  ]);
  if (courses.error) throw dbError(courses.error);
  if (topics.error) throw dbError(topics.error);

  return courses.data.map((course) => {
    const mine = topics.data.filter((t) => t.course_id === course.id);
    const est = mine.reduce((sum, t) => sum + Number(t.est_hours), 0);
    const done = mine.reduce((sum, t) => sum + doneHours(t), 0);
    return {
      ...course,
      est_hours: round1(est),
      done_hours: round1(done),
      spent_hours: round1(mine.reduce((sum, t) => sum + Number(t.actual_hours), 0)),
      percent: est ? Math.round((done / est) * 100) : 0,
      topic_count: mine.length,
      unit_count: new Set(mine.map((t) => t.unit_id)).size,
      days_left: daysBetween(today, course.target_date),
    };
  });
}

module.exports = { doneHours, courseSummaries };
