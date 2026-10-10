-- Job Apply: a favourite star on a job. Starred jobs are listed first.
-- Safe to run again.

alter table public.job_applications add column if not exists favourite boolean not null default false;

-- A job brought back from an Archive copy made before this column existed arrives with it empty (not its default);
-- it comes back without a star.
create or replace function public.job_new_defaults() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.favourite := coalesce(new.favourite, false);
  return new;
end $$;

create or replace trigger job_applications_new_defaults
  before insert on public.job_applications
  for each row execute function public.job_new_defaults();
