-- Timers: several can run at the same time (a project AND a course AND a certificate course), each shown as a circle above the AI circle.
-- Before: one running timer per user. Now: one running timer per project, per course, per library item.
-- Safe to run again.

create unique index if not exists project_time_one_running_per_project_idx on public.project_time (project_id) where ended_at is null;
-- A course timer is keyed by the library item when it is one (resource_id), else by the course.
create unique index if not exists course_time_one_running_per_key_idx on public.course_time ((coalesce(resource_id, course_id))) where ended_at is null;

drop index if exists public.project_time_one_running_idx;
drop index if exists public.course_time_one_running_idx;
