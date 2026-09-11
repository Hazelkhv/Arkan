-- Arkan AI assistant — dashboard queries.
--
-- Applied to the live project as migration
-- 20260910_assistant_analytics_functions. Separate from assistant.sql because
-- these are read-only reporting functions rather than schema: dropping and
-- recreating the lot of them changes nothing about the data.
--
-- They live in the database, not in TypeScript, because every one is a grouped
-- aggregate and supabase-js cannot express a GROUP BY. The alternative is
-- pulling every message of every conversation into a serverless function and
-- counting them there, which stops working at exactly the traffic level that
-- makes a dashboard worth looking at.
--
-- Each takes a window, so "today", "last 30 days" and "all time" are the same
-- code with a different argument.

create or replace function public.assistant_overview (p_since timestamptz)
returns table (
  conversations    bigint,
  visitors         bigint,
  messages         bigint,
  visitor_messages bigint,
  leads            bigint,
  handoffs         bigint,
  thumbs_up        bigint,
  thumbs_down      bigint,
  unanswered       bigint,
  tokens_in        bigint,
  tokens_out       bigint,
  cost_usd         numeric,
  avg_messages     numeric,
  avg_minutes      numeric
)
language sql
stable
set search_path = public
as $fn$
  select
    (select count(*) from public.conversations c where c.started_at >= p_since),
    (select count(distinct c.user_id) from public.conversations c where c.started_at >= p_since),
    (select count(*) from public.messages m where m.created_at >= p_since),
    (select count(*) from public.messages m where m.created_at >= p_since and m.role = 'user'),
    -- Leads the assistant produced. The website form's own leads are counted
    -- on their own page; mixing them in would flatter the conversion rate.
    (select count(*) from public.leads l where l.created_at >= p_since and l.source <> 'website'),
    (select count(*) from public.conversations c
      where c.started_at >= p_since and c.status in ('needs_human','human_active')),
    (select count(*) from public.feedback f where f.created_at >= p_since and f.rating = 1),
    (select count(*) from public.feedback f where f.created_at >= p_since and f.rating = -1),
    (select count(*) from public.messages m
      where m.created_at >= p_since and m.role = 'assistant' and m.retrieved_chunk_ids = '{}'),
    (select coalesce(sum(m.tokens_in), 0) from public.messages m where m.created_at >= p_since),
    (select coalesce(sum(m.tokens_out), 0) from public.messages m where m.created_at >= p_since),
    (select coalesce(sum(m.cost_usd), 0) from public.messages m where m.created_at >= p_since),
    (select coalesce(round(avg(c.message_count), 1), 0) from public.conversations c
      where c.started_at >= p_since),
    -- One-message conversations are excluded from the duration: a visitor who
    -- asked once and left has a duration of zero, and enough of them would make
    -- the average say nothing at all.
    (select coalesce(round(avg(extract(epoch from (c.updated_at - c.started_at)) / 60)::numeric, 1), 0)
       from public.conversations c
      where c.started_at >= p_since and c.message_count > 1);
$fn$;

create or replace function public.assistant_by_channel (p_since timestamptz)
returns table (
  channel       text,
  conversations bigint,
  visitors      bigint,
  messages      bigint,
  leads         bigint
)
language sql
stable
set search_path = public
as $fn$
  -- Driven from a literal list rather than from the rows, so a channel with no
  -- traffic still appears as a zero instead of vanishing from the table.
  select
    ch.channel,
    (select count(*) from public.conversations c
      where c.channel = ch.channel and c.started_at >= p_since),
    (select count(distinct c.user_id) from public.conversations c
      where c.channel = ch.channel and c.started_at >= p_since),
    (select count(*) from public.messages m
       join public.conversations c on c.id = m.conversation_id
      where c.channel = ch.channel and m.created_at >= p_since),
    (select count(*) from public.leads l
      where l.source = ch.channel and l.created_at >= p_since)
  from (values ('web'), ('widget'), ('telegram')) as ch (channel);
$fn$;

create or replace function public.assistant_model_costs (p_since timestamptz)
returns table (
  model      text,
  answers    bigint,
  tokens_in  bigint,
  tokens_out bigint,
  cost_usd   numeric
)
language sql
stable
set search_path = public
as $fn$
  select
    m.model_used,
    count(*),
    coalesce(sum(m.tokens_in), 0),
    coalesce(sum(m.tokens_out), 0),
    coalesce(sum(m.cost_usd), 0)
  from public.messages m
  where m.created_at >= p_since
    and m.model_used is not null
  group by m.model_used
  order by 5 desc, 2 desc;
$fn$;

-- "Most frequent topics", answered honestly: which sources the retriever keeps
-- reaching for. Clustering the questions would be a guess dressed up as a
-- metric; this is a count of something that actually happened.
create or replace function public.assistant_top_sources (
  p_since timestamptz,
  p_limit integer default 8
)
returns table (
  document_id uuid,
  title       text,
  citations   bigint
)
language sql
stable
set search_path = public
as $fn$
  select d.id, d.title, count(*) as citations
  from public.messages m
  cross join lateral unnest(m.retrieved_chunk_ids) as chunk_id
  join public.chunks c    on c.id = chunk_id
  join public.documents d on d.id = c.document_id
  where m.created_at >= p_since
  group by d.id, d.title
  order by citations desc
  limit greatest(p_limit, 1);
$fn$;

-- Questions the knowledge base could not answer: an assistant message that
-- retrieved nothing, paired with the visitor message immediately before it.
-- This list is the backlog for the knowledge base, which is why it is a report
-- and not a metric.
create or replace function public.assistant_unanswered (
  p_since timestamptz,
  p_limit integer default 50
)
returns table (
  question        text,
  asked_at        timestamptz,
  conversation_id uuid,
  channel         text
)
language sql
stable
set search_path = public
as $fn$
  select
    q.content,
    q.created_at,
    q.conversation_id,
    c.channel
  from public.messages a
  join lateral (
    select m.content, m.created_at, m.conversation_id
    from public.messages m
    where m.conversation_id = a.conversation_id
      and m.role = 'user'
      and m.created_at <= a.created_at
    order by m.created_at desc
    limit 1
  ) q on true
  join public.conversations c on c.id = a.conversation_id
  where a.role = 'assistant'
    and a.retrieved_chunk_ids = '{}'
    and a.content <> ''
    and a.created_at >= p_since
  order by q.created_at desc
  limit greatest(p_limit, 1);
$fn$;

-- Read by the server as service_role. PostgREST would otherwise expose every
-- one of these to anon, and Arkan's conversation volume is nobody else's
-- business.
revoke all on function public.assistant_overview(timestamptz)             from public, anon, authenticated;
revoke all on function public.assistant_by_channel(timestamptz)           from public, anon, authenticated;
revoke all on function public.assistant_model_costs(timestamptz)          from public, anon, authenticated;
revoke all on function public.assistant_top_sources(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.assistant_unanswered(timestamptz, integer)  from public, anon, authenticated;
