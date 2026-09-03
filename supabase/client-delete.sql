-- Permanently deleting a client, for the ones created by accident.
--
-- Archiving already exists and is the right answer almost always: an archived
-- client keeps its whole history and drops out of MRR, the Meta sync and every
-- list. This is the other case -- a client typed in by mistake.
--
-- TWO RULES, ENFORCED IN THE DATABASE.
--
--   1. The client must be archived. Archiving is the reversible step and where
--      a mistake gets caught. Deleting is not reversible.
--   2. The client must have NO COLLECTED MONEY. Every paid payment feeds the
--      lifetime profit split, so cascading one away moves money out of Ethan's
--      column with nothing left to explain the change. Exodus is the live
--      example: $2,248 collected, $1,124 of it his at 50%.
--
-- They are enforced in a BEFORE DELETE trigger, not just in the RPC below,
-- because this app has no login and the anon key reaches the tables directly.
-- A guard that lives only in a React component is not a guard.
--
-- Pending schedule rows are not money -- the CRM generates twelve months of
-- them on its own -- so they go with the client.
--
-- Applied as migrations permanent_client_delete and
-- fix_client_delete_preview_array_append. This file is the readable copy.

-- What is attached, and whether it can go.
--
-- Built by WALKING THE FOREIGN KEYS rather than from a hardcoded list, so a
-- table added later shows up here instead of being quietly destroyed by a
-- preview that never mentioned it.
create or replace function client_delete_preview(p_client_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_client   record;
  v_fk       record;
  v_count    bigint;
  v_attached jsonb := '[]'::jsonb;
  v_collected numeric;
  v_settled  bigint;
  v_blockers text[] := '{}';
begin
  select * into v_client from clients where id = p_client_id;
  if not found then
    raise exception 'No client with id %', p_client_id using errcode = 'no_data_found';
  end if;

  for v_fk in
    select cl.relname::text as tbl,
           a.attname::text  as col,
           con.confdeltype  as del
    from pg_constraint con
    join pg_class cl     on cl.oid = con.conrelid
    join pg_attribute a  on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'public.clients'::regclass
      and array_length(con.conkey, 1) = 1
    order by cl.relname
  loop
    execute format('select count(*) from public.%I where %I = $1', v_fk.tbl, v_fk.col)
      into v_count using p_client_id;

    if v_count > 0 then
      v_attached := v_attached || jsonb_build_object(
        'table', v_fk.tbl,
        'rows',  v_count,
        -- 'c' cascades (the rows go); 'n' sets null (the rows survive, just
        -- unattached, which is how expenses keep real spending on the books).
        -- Showing the difference is the whole point of the preview.
        'action', case v_fk.del when 'c' then 'deleted' when 'n' then 'kept, unlinked' else 'blocked' end
      );
    end if;
  end loop;

  select coalesce(sum(amount), 0),
         count(*) filter (where partner_payout_id is not null)
    into v_collected, v_settled
  from payments
  where client_id = p_client_id and status = 'paid' and paid_date is not null;

  -- array_append, not `||`. `v_blockers || 'text'` makes Postgres read the
  -- string as an array literal and fail at runtime -- the same trap as the
  -- deliverable seeding trigger.
  if not v_client.archived then
    v_blockers := array_append(v_blockers, 'Archive the client first — archiving is the step you can undo.');
  end if;
  if v_collected > 0 then
    v_blockers := array_append(v_blockers, format(
      '%s has $%s of collected payments, which is in the lifetime profit split. Deleting it would move money out of the books with no record.',
      v_client.name, trim(to_char(v_collected, '999999990.99'))));
  end if;

  return jsonb_build_object(
    'client_id',        v_client.id,
    'name',             v_client.name,
    'archived',         v_client.archived,
    'attached',         v_attached,
    'collected',        v_collected,
    'settled_payments', v_settled,
    'blockers',         to_jsonb(v_blockers),
    'can_delete',       cardinality(v_blockers) = 0
  );
end $$;

-- The invariant itself. Every delete on clients goes through this, whether it
-- comes from the RPC below, from PostgREST, or from a psql session at 2am.
create or replace function clients_block_unsafe_delete()
returns trigger
language plpgsql
as $$
declare
  v_collected numeric;
begin
  if not old.archived then
    raise exception 'Cannot delete "%": archive it first. Archiving is reversible; this is not.', old.name
      using errcode = 'check_violation';
  end if;

  select coalesce(sum(amount), 0) into v_collected
  from payments
  where client_id = old.id and status = 'paid' and paid_date is not null;

  if v_collected > 0 then
    raise exception
      'Cannot delete "%": $% of collected payments are attached, and that money is in the lifetime profit split. Keep the client archived instead.',
      old.name, trim(to_char(v_collected, '999999990.99'))
      using errcode = 'check_violation';
  end if;

  return old;
end $$;

drop trigger if exists trg_clients_block_unsafe_delete on clients;
create trigger trg_clients_block_unsafe_delete
  before delete on clients
  for each row execute function clients_block_unsafe_delete();

-- The path the UI takes. Returns what it destroyed, so the app can report the
-- delete rather than just claiming it happened.
--
-- p_expect_name is a mismatch guard: the client the screen was showing has to
-- be the client the database deletes. Cheap insurance against a stale page.
create or replace function delete_client_permanently(p_client_id uuid, p_expect_name text)
returns jsonb
language plpgsql
as $$
declare
  v_name    text;
  v_preview jsonb;
begin
  select name into v_name from clients where id = p_client_id for update;
  if not found then
    raise exception 'No client with id %', p_client_id using errcode = 'no_data_found';
  end if;

  if p_expect_name is distinct from v_name then
    raise exception 'Expected to delete "%" but that id is "%". Reload and try again.', p_expect_name, v_name
      using errcode = 'check_violation';
  end if;

  -- Taken BEFORE the delete: afterwards there is nothing left to count.
  v_preview := client_delete_preview(p_client_id);

  if not (v_preview->>'can_delete')::boolean then
    raise exception '%', coalesce(v_preview->'blockers'->>0, 'This client cannot be deleted.')
      using errcode = 'check_violation';
  end if;

  delete from clients where id = p_client_id;

  return jsonb_set(v_preview, '{deleted}', 'true'::jsonb);
end $$;
