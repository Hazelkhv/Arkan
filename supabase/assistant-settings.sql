-- Arkan AI assistant — operator settings that belong to no other table.
--
-- Applied to the live project as migration 20260910_assistant_app_settings.
--
-- A key/value table rather than columns, because these are a handful of
-- unrelated knobs — a rate limit, a retention period — and a table with one row
-- and one column per setting acquires a migration every time somebody wants
-- another one. Everything with real structure (models, embedding, channels)
-- keeps its own table with its own constraints.

create table if not exists public.app_settings (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  updated_by uuid        references public.admin_users (id) on delete set null
);

alter table public.app_settings enable row level security;

insert into public.app_settings (key, value)
select 'rate_limit', '{"windowSeconds": 60, "max": 12}'::jsonb
where not exists (select 1 from public.app_settings where key = 'rate_limit');

insert into public.app_settings (key, value)
select 'retention', '{"conversationDays": 0}'::jsonb
where not exists (select 1 from public.app_settings where key = 'retention');

-- Deletes conversations, and with them their messages and feedback, older than
-- the retention period. Returns how many went.
--
-- A day count of 0 means "keep everything", and it is the shipped default: a
-- retention policy that starts deleting on installation would throw away a
-- firm's records before anybody had decided it should.
--
-- Leads are never touched. A lead is a business record, not a transcript, and
-- the conversation_id on it is nulled by the foreign key rather than taking the
-- lead with it.
create or replace function public.purge_old_conversations (p_days integer)
returns bigint
language plpgsql
set search_path = public
as $fn$
declare
  removed bigint;
begin
  if p_days is null or p_days <= 0 then
    return 0;
  end if;

  with gone as (
    delete from public.conversations
     where updated_at < now() - make_interval(days => p_days)
       and status = 'closed'
    returning 1
  )
  select count(*) into removed from gone;

  return removed;
end;
$fn$;

revoke all on function public.purge_old_conversations(integer)
  from public, anon, authenticated;

-- To run it nightly instead of by hand, pg_cron is available on this project:
--
--   select cron.schedule(
--     'arkan-purge-conversations', '0 3 * * *',
--     $$select public.purge_old_conversations(
--         (select (value->>'conversationDays')::int
--            from public.app_settings where key = 'retention'))$$);
--
-- It is deliberately not scheduled here. A job that deletes a client's records
-- on a timer should be switched on by the person who owns those records.
