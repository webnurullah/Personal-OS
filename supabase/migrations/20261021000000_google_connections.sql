-- Calendar → Google Calendar: one link per person to their Google account (read-only access to their calendars).
-- The app keeps only a refresh token, and it is stored ENCRYPTED by the server (AES-256-GCM, key GOOGLE_TOKEN_KEY in Vercel):
-- what is in this table cannot be used without that key. It is not part of the data export, and "Delete all my data" removes it.
-- Not an Archive kind: there is nothing to restore, you simply connect again.
-- Safe to run again.

create table if not exists public.google_connections (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  google_email text not null default '' check (char_length(google_email) <= 320),
  refresh_token_enc text not null check (char_length(refresh_token_enc) between 1 and 4000),
  scope text not null default '' check (char_length(scope) <= 1000),
  -- ok: working. reconnect: Google no longer accepts the link (access removed, password changed, 7-day test limit) - connect again.
  status text not null default 'ok' check (status in ('ok', 'reconnect')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists google_connections_updated_at on public.google_connections;
create trigger google_connections_updated_at before update on public.google_connections for each row execute function public.set_updated_at();

alter table public.google_connections enable row level security;
drop policy if exists "Own rows" on public.google_connections;
create policy "Own rows" on public.google_connections for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.google_connections from anon;
grant select, insert, update, delete on public.google_connections to authenticated;
