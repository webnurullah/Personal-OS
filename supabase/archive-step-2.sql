-- Archive, step 2 of 2: run this once in Supabase -> SQL Editor -> New query -> paste -> Run.
-- (Step 1, the Archive table and the list of item types, is already in your database.)
-- It adds the two functions that move an item into the Archive and bring it back.

-- Moves one item (with what goes with it) from its table into the Archive. Returns the Archive entry's id.
-- Runs with your own rights, so Row Level Security still decides what you can see and delete.
create function public.archive_delete(p_kind text, p_id uuid) returns uuid
language plpgsql set search_path = '' as $$
declare
  cfg jsonb := public.archive_config(p_kind);
  r jsonb;
  spec jsonb;
  found_rows jsonb;
  children jsonb := '{}';
  relinks jsonb := '{}';
  n int := 0;
  v_title text;
  v_detail text;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if cfg is null then
    raise exception 'Unknown kind of item.';
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', cfg ->> 'table') into r using p_id;
  if r is null then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;

  for spec in select * from jsonb_array_elements(coalesce(cfg -> 'children', '[]')) loop
    execute format('select coalesce(jsonb_agg(to_jsonb(c)), ''[]''::jsonb) from public.%I c where c.%I = $1', spec ->> 0, spec ->> 1)
      into found_rows using p_id;
    children := children || jsonb_build_object(spec ->> 0, found_rows);
    n := n + jsonb_array_length(found_rows);
  end loop;

  for spec in select * from jsonb_array_elements(coalesce(cfg -> 'relinks', '[]')) loop
    execute format('select coalesce(jsonb_agg(c.id), ''[]''::jsonb) from public.%I c where c.%I = $1', spec ->> 0, spec ->> 1)
      into found_rows using p_id;
    relinks := relinks || jsonb_build_object((spec ->> 0) || '.' || (spec ->> 1), found_rows);
  end loop;

  v_title := left(coalesce(nullif(btrim(r ->> (cfg ->> 'title')), ''), 'Untitled'), 300);
  select left(coalesce(string_agg(nullif(btrim(r ->> d.c), ''), ' ' order by d.o), ''), 300)
    into v_detail
    from jsonb_array_elements_text(coalesce(cfg -> 'detail', '[]')) with ordinality as d(c, o);

  insert into public.archive_items (user_id, kind, title, detail, related, data)
  values (auth.uid(), p_kind, v_title, v_detail, n, jsonb_build_object('row', r, 'children', children, 'relinks', relinks))
  returning id into new_id;

  -- Rows that depended on it (milestones, units, history …) go with it; links from other rows are cleared.
  execute format('delete from public.%I where id = $1', cfg ->> 'table') using p_id;
  return new_id;
end $$;

-- Puts an Archive entry back where it came from. Returns { kind, id, title }.
create function public.archive_restore(p_id uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare
  item public.archive_items;
  cfg jsonb;
  r jsonb;
  spec jsonb;
  there boolean;
  child_rows jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select * into item from public.archive_items where id = p_id;
  if not found then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  cfg := public.archive_config(item.kind);
  r := item.data -> 'row';

  -- Links to things that have been deleted since.
  for spec in select * from jsonb_array_elements(coalesce(cfg -> 'fks', '[]')) loop
    if r ->> (spec ->> 0) is not null then
      execute format('select exists (select 1 from public.%I where id = $1)', spec ->> 1) into there using (r ->> (spec ->> 0))::uuid;
      if not there then
        if (spec ->> 2)::boolean then
          raise exception 'The % this belongs to is not in your lists any more. Restore the % from the Archive first, then restore this.', spec ->> 3, spec ->> 3;
        end if;
        r := r || jsonb_build_object(spec ->> 0, null);
      end if;
    end if;
  end loop;

  begin
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', cfg ->> 'table', cfg ->> 'table') using r;
    for spec in select * from jsonb_array_elements(coalesce(cfg -> 'children', '[]')) loop
      child_rows := coalesce(item.data -> 'children' -> (spec ->> 0), '[]');
      if jsonb_array_length(child_rows) > 0 then
        execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', spec ->> 0, spec ->> 0) using child_rows;
      end if;
    end loop;
  exception when unique_violation then
    raise exception 'Something with the same name is already in your lists. Rename or remove it, then restore this again.';
  end;

  -- Rows that lost their link to it get it back (only if they have not been linked to something else since).
  for spec in select * from jsonb_array_elements(coalesce(cfg -> 'relinks', '[]')) loop
    child_rows := coalesce(item.data -> 'relinks' -> ((spec ->> 0) || '.' || (spec ->> 1)), '[]');
    if jsonb_array_length(child_rows) > 0 then
      execute format('update public.%I set %I = $1 where %I is null and id in (select (jsonb_array_elements_text($2))::uuid)', spec ->> 0, spec ->> 1, spec ->> 1)
        using (r ->> 'id')::uuid, child_rows;
    end if;
  end loop;

  delete from public.archive_items where id = p_id;
  return jsonb_build_object('kind', item.kind, 'id', r ->> 'id', 'title', item.title);
end $$;

revoke execute on function public.archive_config(text) from public, anon;
revoke execute on function public.archive_delete(text, uuid) from public, anon;
revoke execute on function public.archive_restore(uuid) from public, anon;
grant execute on function public.archive_config(text) to authenticated;
grant execute on function public.archive_delete(text, uuid) to authenticated;
grant execute on function public.archive_restore(uuid) to authenticated;
