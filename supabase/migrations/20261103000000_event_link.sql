-- Calendar: an optional link on an event (a meeting room, a registration page …), shown as a link icon on the event.
-- Safe to run again.

alter table public.events add column if not exists link text not null default '' check (char_length(link) <= 500);

-- An event brought back from an Archive copy made before this column existed arrives with it empty (not its default);
-- it comes back without a link.
create or replace function public.event_new_defaults() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.link := coalesce(new.link, '');
  return new;
end $$;

create or replace trigger events_new_defaults
  before insert on public.events
  for each row execute function public.event_new_defaults();
