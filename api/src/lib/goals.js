/**
 * A goal's progress, worked out from its facts:
 * - "value" goals: current ÷ target
 * - "milestones" goals: ticked milestones ÷ all milestones
 * Milestones with an at_value tick themselves once the goal reaches that value.
 * @template {{ current_value: number; target_value: number; progress_mode: string; goal_milestones?: Array<{ at_value: number | null; done: boolean; position: number }> }} G
 * @param {G} goal
 */
function withProgress(goal) {
  const { goal_milestones: raw = [], ...rest } = goal;
  const milestones = [...raw]
    .sort((a, b) => a.position - b.position)
    .map((m) => ({ ...m, done: m.at_value === null ? m.done : Number(goal.current_value) >= Number(m.at_value) }));

  let percent;
  if (goal.progress_mode === 'milestones') {
    percent = milestones.length ? Math.round((milestones.filter((m) => m.done).length / milestones.length) * 100) : 0;
  } else {
    percent = Math.min(100, Math.round((Number(goal.current_value) / Number(goal.target_value)) * 100));
  }
  return { ...rest, milestones, percent };
}

module.exports = { withProgress };
