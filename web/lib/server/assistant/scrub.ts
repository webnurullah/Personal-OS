// What the assistant is not given: the notes of a course (rich text, up to about 100,000 letters, and not meant for the assistant's
// answers). Topics also have a `notes` field and keep it: only a course (it has `notes_updated_at`) is cleaned.

export function withoutCourseNotes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutCourseNotes);
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    const isCourse = "notes_updated_at" in row;
    return Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => !(isCourse && (key === "notes" || key === "notes_updated_at" || key === "notes_share")))
        .map(([key, item]) => [key, withoutCourseNotes(item)]),
    );
  }
  return value;
}
