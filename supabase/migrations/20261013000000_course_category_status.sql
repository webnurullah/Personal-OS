-- Learning: courses get a category (written by the person, for example "Digital Marketing" over "Google Ads" and "Meta Ads")
-- and a status (active, paused or done), so the course list can be filtered like the project list.

alter table public.courses
  add column if not exists category text not null default '' check (char_length(category) <= 60),
  add column if not exists status text not null default 'active' check (status in ('active', 'paused', 'done'));

-- A course brought back from an Archive copy made before these columns existed arrives with them empty (not their defaults);
-- it comes back active and without a category.
create or replace function public.course_new_defaults() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.category := coalesce(new.category, '');
  new.status := coalesce(new.status, 'active');
  return new;
end $$;

drop trigger if exists courses_new_defaults on public.courses;
create trigger courses_new_defaults
  before insert on public.courses
  for each row execute function public.course_new_defaults();
