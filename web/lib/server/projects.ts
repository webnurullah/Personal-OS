// Server helpers for projects.
import { dateIn } from "./dates.ts";

/**
 * Adds the calendar day a project was added / archived, in the USER's time zone.
 * (Cutting the date off a timestamp would give the UTC day, which is a day behind in Bangladesh
 * for the first six hours of every morning.)
 */
export function withDays<P extends { created_at: string; archived_at?: string | null }>(project: P, zone: string) {
  return {
    ...project,
    created_on: dateIn(new Date(project.created_at), zone),
    archived_on: project.archived_at ? dateIn(new Date(project.archived_at), zone) : null,
  };
}
