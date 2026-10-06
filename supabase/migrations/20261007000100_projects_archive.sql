-- Archive: removing a project moves it to the Archive first. From there it can be restored or deleted for good.
-- null = not archived. The project keeps its status (active/paused/done) while archived.
alter table public.projects add column archived_at timestamptz;
