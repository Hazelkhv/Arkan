-- Arkan AI assistant — schema.
--
-- Companion to schema.sql, which owns the website consultation form alone.
-- Running this file on a fresh project reproduces the state the live project
-- reached through the 20260910 `assistant_*` migrations.
--
-- SECURITY MODEL, in one line: every table below has RLS enabled and NOT ONE
-- policy, so a publishable key reaches nothing at all. The server talks to
-- these tables with the service role key, which bypasses RLS. That is why
-- SUPABASE_SERVICE_ROLE_KEY is optional for the website form but REQUIRED for
-- the assistant: the form's insert-only policy has no equivalent here, and it
-- should not have one — the knowledge base, every visitor's conversation and
-- every API setting would otherwise be readable with a key that ships to the
-- browser.

create extension if not exists vector with schema extensions;

-- ── Admin identity ──────────────────────────────────────────────────────────
--
-- Login is Supabase Auth; authorisation is this table. A row here is what makes
-- an authenticated user an operator, so revoking access is a delete rather than
-- a password change. `id` mirrors auth.users.id instead of being generated, so
-- the join needs no second lookup.

create table if not exists public.admin_users (
  id            uuid        primary key,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz,
  email         text        not null unique,
  name          text,
  -- read_only is the default on purpose: an invitation that forgets to set a
  -- role grants the least, not the most.
  role          text        not null default 'read_only'
                            check (role in ('owner','admin','editor','operator','read_only')),
  is_active     boolean     not null default true
);

create table if not exists public.audit_log (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null    default now(),
  admin_user_id uuid        references public.admin_users (id) on delete set null,
  -- Kept even when the admin row is deleted: an audit trail that disappears
  -- with the account it records is not an audit trail.
  actor_email   text,
  action        text        not null,
  target        text,
  detail        jsonb       not null    default '{}'
);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

-- ── Knowledge base ──────────────────────────────────────────────────────────
--
-- 1536 dimensions, not the model default of 3072: pgvector indexes `vector`
-- only up to 2,000 dimensions, so 3072 would force either a sequential scan or
-- a halfvec cast on every query. text-embedding-3-large accepts a `dimensions`
-- parameter and is Matryoshka-trained, so truncating to 1536 is a supported
-- operation rather than a lossy one.
--
-- CHANGING THE EMBEDDING MODEL is not an in-place edit. The column type is
-- fixed at 1536, and vectors from two different models are not comparable even
-- at equal width. The migration path is add / backfill / cut over:
--
--   1. alter table public.chunks add column embedding_next extensions.vector(N);
--   2. re-embed every chunk into embedding_next with the new model;
--   3. build the HNSW index on embedding_next;
--   4. in one transaction, drop embedding, rename embedding_next to embedding,
--      and replace match_chunks with the new dimension.
--
-- Nothing is destroyed until step 4, so a failed backfill leaves the live index
-- still answering. `model` and `dimensions` on each row are what let step 2
-- find the chunks it has not converted yet.

create table if not exists public.documents (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null    default now(),
  updated_at   timestamptz not null    default now(),
  created_by   uuid        references public.admin_users (id) on delete set null,
  title        text        not null,
  source_type  text        not null    check (source_type in ('pdf','docx','text','url')),
  source_url   text,
  -- The extracted text, kept so a re-index never needs the original file back
  -- or a second crawl of a page that may have changed underneath us.
  raw_text     text,
  status       text        not null    default 'pending'
                           check (status in ('pending','processing','ready','failed')),
  error        text,
  tags         text[]      not null    default '{}',
  chunk_count  integer     not null    default 0
);

create index if not exists documents_status_idx  on public.documents (status);
create index if not exists documents_created_idx on public.documents (created_at desc);

create table if not exists public.chunks (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null    default now(),
  document_id uuid        not null    references public.documents (id) on delete cascade,
  chunk_index integer     not null,
  content     text        not null,
  token_count integer     not null    default 0,
  -- Which model produced this vector. Lets a re-index find stale rows instead
  -- of guessing, and makes a half-finished cutover diagnosable.
  model       text        not null,
  dimensions  integer     not null,
  embedding   extensions.vector(1536),
  metadata    jsonb       not null    default '{}',
  unique (document_id, chunk_index)
);

create index if not exists chunks_document_idx on public.chunks (document_id);

-- HNSW over cosine distance. Safe to build on an empty table, unlike ivfflat,
-- which needs rows present before it can choose its lists.
create index if not exists chunks_embedding_idx
  on public.chunks using hnsw (embedding extensions.vector_cosine_ops);

-- ── Conversation, shared by every channel ───────────────────────────────────
--
-- One brain, many channels: `channel` is the only thing that differs between a
-- Telegram chat, the widget and the full-page chat.

create table if not exists public.unified_users (
  id          uuid        primary key default gen_random_uuid(),
  first_seen  timestamptz not null    default now(),
  last_seen   timestamptz not null    default now(),
  channel     text        not null    check (channel in ('web','widget','telegram')),
  -- Telegram chat_id, or an anonymous browser session id for web and widget.
  external_id text        not null,
  name        text,
  email       text,
  phone       text,
  metadata    jsonb       not null    default '{}',
  unique (channel, external_id)
);

create table if not exists public.conversations (
  id                 uuid        primary key default gen_random_uuid(),
  started_at         timestamptz not null    default now(),
  updated_at         timestamptz not null    default now(),
  channel            text        not null    check (channel in ('web','widget','telegram')),
  user_id            uuid        references public.unified_users (id) on delete set null,
  status             text        not null    default 'active'
                                 check (status in ('active','needs_human','human_active','closed')),
  -- Why the bot stepped aside, shown at the top of the handoff queue so an
  -- operator can triage without reading the whole thread first.
  handoff_reason     text,
  assigned_to        uuid        references public.admin_users (id) on delete set null,
  flagged            boolean     not null    default false,
  -- Rolling summary of turns already dropped from the live window, so a long
  -- conversation stays inside the context limit without losing its thread.
  summary            text,
  -- How many messages the summary already covers. Without it, summarising a
  -- second time would either repeat or skip turns.
  summarized_through integer     not null    default 0,
  title              text,
  message_count      integer     not null    default 0
);

create index if not exists conversations_channel_idx on public.conversations (channel, started_at desc);
create index if not exists conversations_status_idx  on public.conversations (status)
  where status in ('needs_human','human_active');

create table if not exists public.messages (
  id                  uuid        primary key default gen_random_uuid(),
  created_at          timestamptz not null    default now(),
  conversation_id     uuid        not null    references public.conversations (id) on delete cascade,
  role                text        not null    check (role in ('user','assistant','system','tool')),
  content             text        not null,
  -- Null for user messages. Kept per message rather than aggregated so the
  -- dashboard can attribute cost per model, and the inbox can show which chunks
  -- produced an answer when debugging a bad one.
  model_used          text,
  provider            text,
  tokens_in           integer,
  tokens_out          integer,
  -- Priced at call time from the OpenRouter catalog. Storing the money rather
  -- than recomputing it later means a price change cannot rewrite history.
  cost_usd            numeric(12, 6),
  retrieved_chunk_ids uuid[]      not null    default '{}',
  -- Best similarity seen for this answer. An assistant message with no chunk
  -- ids is what the "unanswered questions" report is built from: the question
  -- is the user message immediately before it.
  top_similarity      real,
  tool_calls          jsonb,
  finish_reason       text,
  latency_ms          integer,
  error               text
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
create index if not exists messages_model_idx        on public.messages (model_used, created_at desc)
  where model_used is not null;
create index if not exists messages_unanswered_idx   on public.messages (created_at desc)
  where role = 'assistant' and retrieved_chunk_ids = '{}';

create table if not exists public.feedback (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null    default now(),
  message_id uuid        not null    references public.messages (id) on delete cascade,
  rating     smallint    not null    check (rating in (-1, 1)),
  comment    text,
  -- One rating per message: a second thumb replaces the first rather than
  -- stacking, which is what the UI lets a visitor do.
  unique (message_id)
);

create index if not exists feedback_rating_idx on public.feedback (rating, created_at desc);

-- ── Configuration ───────────────────────────────────────────────────────────
--
-- Everything an operator can tune lives here, never in code: the persona and
-- the active model must be editable from the admin panel without a deploy.

create table if not exists public.prompt_versions (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null    default now(),
  created_by uuid        references public.admin_users (id) on delete set null,
  label      text,
  content    text        not null,
  persona    text,
  is_active  boolean     not null    default false
);

-- At most one active prompt, enforced by the database rather than by trusting
-- every write path to remember. Rollback is therefore "activate version N",
-- never a destructive edit: previous versions are all still here.
create unique index if not exists prompt_versions_one_active_idx
  on public.prompt_versions (is_active) where is_active;

create table if not exists public.model_config (
  id                 uuid         primary key default gen_random_uuid(),
  updated_at         timestamptz  not null default now(),
  -- null = the default, used by any channel without a row of its own.
  channel            text         check (channel in ('web','widget','telegram')),
  provider           text         not null default 'openrouter',
  -- Nullable, and null is the shipped default: it means "resolve from the live
  -- OpenRouter catalog", which is the only way to have a sensible default model
  -- that does not rot. A slug written here at build time is a slug that will be
  -- retired without warning; lib/ai/catalog.ts picks the current cheapest
  -- tool-capable model from the preferred families instead. Pinning a specific
  -- slug from the admin panel writes it here and turns the resolution off.
  active_model       text,
  fallback_model     text,
  temperature        numeric(3,2) not null default 0.30 check (temperature between 0 and 2),
  max_tokens         integer      not null default 1024 check (max_tokens > 0),
  top_p              numeric(3,2) not null default 1.00 check (top_p between 0 and 1),
  -- Entries of {days:[1,2], from:"09:00", to:"17:00", model:"..."}, evaluated
  -- before active_model so a schedule overrides it by day and time range.
  schedule           jsonb        not null default '[]',
  monthly_budget_usd numeric(10,2)
);

-- Two partial indexes, not one `unique` column, because in Postgres a unique
-- constraint does not collapse NULLs: `channel text unique` would happily allow
-- a second default row and the two would disagree silently.
create unique index if not exists model_config_channel_idx
  on public.model_config (channel) where channel is not null;
create unique index if not exists model_config_default_idx
  on public.model_config ((true)) where channel is null;

create table if not exists public.embedding_config (
  id                   uuid         primary key default gen_random_uuid(),
  updated_at           timestamptz  not null default now(),
  is_active            boolean      not null default false,
  provider             text         not null check (provider in ('openai','cohere','google','voyage')),
  model                text         not null,
  dimensions           integer      not null,
  chunk_size           integer      not null default 500  check (chunk_size between 100 and 4000),
  chunk_overlap        integer      not null default 50   check (chunk_overlap >= 0),
  chunking_strategy    text         not null default 'recursive'
                                    check (chunking_strategy in ('recursive','paragraph','fixed')),
  top_k                integer      not null default 6    check (top_k between 1 and 50),
  similarity_threshold numeric(4,3) not null default 0.300,
  reranker_enabled     boolean      not null default false,
  reranker_provider    text,
  reranker_model       text,
  rerank_candidates    integer      not null default 24,
  check (chunk_overlap < chunk_size)
);

create unique index if not exists embedding_config_one_active_idx
  on public.embedding_config (is_active) where is_active;

-- Per-channel presentation: the greeting, the starter questions, and — for the
-- widget — how it looks and where it is allowed to load. Copy lives here rather
-- than in lib/content.ts because an operator edits it, not a deploy.
create table if not exists public.channel_settings (
  channel         text        primary key check (channel in ('web','widget','telegram')),
  updated_at      timestamptz not null default now(),
  enabled         boolean     not null default true,
  welcome_message text,
  quick_replies   text[]      not null default '{}',
  -- Widget only: {"accent":"#143A32","position":"right","launcher_label":"…"}.
  appearance      jsonb       not null default '{}',
  -- Widget only. Empty means "refuse every origin": a blank allowlist must fail
  -- closed, or forgetting to fill it in would embed the bot on any site at all.
  allowed_domains text[]      not null default '{}'
);

create table if not exists public.broadcasts (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null    default now(),
  created_by   uuid        references public.admin_users (id) on delete set null,
  channel      text        not null    default 'telegram' check (channel in ('telegram')),
  body         text        not null,
  status       text        not null    default 'draft'
                           check (status in ('draft','sending','sent','failed')),
  sent_count   integer     not null    default 0,
  failed_count integer     not null    default 0,
  started_at   timestamptz,
  finished_at  timestamptz,
  error        text
);

-- ── Rate limiting ───────────────────────────────────────────────────────────
--
-- In the database rather than in memory because every channel runs on
-- serverless functions: a per-instance counter would reset on each cold start
-- and be trivially bypassed by parallel requests landing on different instances.

create table if not exists public.rate_limits (
  scope        text        not null,
  key          text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (scope, key, window_start)
);

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

-- One statement per check, so two simultaneous requests cannot both read the
-- same count and both decide they are under the limit.
create or replace function public.bump_rate_limit (
  p_scope   text,
  p_key     text,
  p_window  integer,
  p_limit   integer
)
returns table (allowed boolean, used integer, resets_at timestamptz)
language plpgsql
set search_path = public
as $fn$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window) * p_window);
  c integer;
begin
  insert into public.rate_limits as r (scope, key, window_start, count)
  values (p_scope, p_key, w, 1)
  on conflict (scope, key, window_start)
    do update set count = r.count + 1
  returning r.count into c;

  -- Windows older than a day can never be consulted again. Pruned occasionally
  -- rather than on every call so the common path stays a single upsert.
  if random() < 0.005 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return query select c <= p_limit, c, w + make_interval(secs => p_window);
end;
$fn$;

-- ── The website leads table, shared ─────────────────────────────────────────
--
-- The form and the assistant write the same table, so the firm has one list of
-- leads and not two. `source` says which wrote the row, and conversation_id
-- opens the conversation that produced it. Existing rows predate the assistant,
-- which is why 'website' is the right default for them.

alter table public.leads
  add column if not exists source          text not null default 'website',
  add column if not exists conversation_id uuid references public.conversations (id) on delete set null,
  add column if not exists notes           text;

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_source_check') then
    alter table public.leads
      add constraint leads_source_check check (source in ('website','web','widget','telegram'));
  end if;
end
$do$;

create index if not exists leads_source_idx on public.leads (source, created_at desc);

-- ── Row level security: deny by default ─────────────────────────────────────
--
-- No policies follow, on purpose. See the note at the top of this file.

alter table public.admin_users      enable row level security;
alter table public.audit_log        enable row level security;
alter table public.documents        enable row level security;
alter table public.chunks           enable row level security;
alter table public.unified_users    enable row level security;
alter table public.conversations    enable row level security;
alter table public.messages         enable row level security;
alter table public.feedback         enable row level security;
alter table public.prompt_versions  enable row level security;
alter table public.model_config     enable row level security;
alter table public.embedding_config enable row level security;
alter table public.channel_settings enable row level security;
alter table public.broadcasts       enable row level security;
alter table public.rate_limits      enable row level security;

-- ── Retrieval ───────────────────────────────────────────────────────────────
--
-- supabase-js cannot express the `<=>` operator, so similarity search goes
-- through this function. `threshold` filters on similarity, not distance, so a
-- higher number is stricter — the direction an operator expects from a slider
-- labelled "similarity threshold".
--
-- The threshold is applied alongside the ORDER BY rather than after it, so a
-- query with no good match returns fewer than match_count rows instead of
-- match_count bad ones. That empty result is what the guardrail in the engine
-- reads as "we do not know this".

create or replace function public.match_chunks (
  query_embedding extensions.vector(1536),
  match_count     integer default 6,
  threshold       double precision default 0.3,
  filter_tags     text[] default null
)
returns table (
  id          uuid,
  document_id uuid,
  content     text,
  similarity  double precision,
  chunk_index integer,
  title       text,
  source_url  text
)
language sql
stable
-- Pinned so the function cannot be redirected by a caller's search_path.
set search_path = public, extensions
as $fn$
  select
    c.id,
    c.document_id,
    c.content,
    1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity,
    c.chunk_index,
    d.title,
    d.source_url
  from public.chunks c
  join public.documents d on d.id = c.document_id
  where c.embedding is not null
    and d.status = 'ready'
    and (filter_tags is null or d.tags && filter_tags)
    and 1 - (c.embedding operator(extensions.<=>) query_embedding) >= threshold
  order by c.embedding operator(extensions.<=>) query_embedding
  limit greatest(match_count, 1);
$fn$;

-- PostgREST exposes public functions to anon by default, and this one reads the
-- whole knowledge base. The server calls it as service_role.
revoke all on function public.match_chunks(extensions.vector, integer, double precision, text[])
  from public, anon, authenticated;
revoke all on function public.bump_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;

-- message_count is denormalised so the admin inbox can list hundreds of
-- conversations without running a count(*) per row. Incremented in a single
-- statement because two channels can be appending to the same conversation,
-- and a counter that loses an increment is one nobody can trust afterwards.

create or replace function public.bump_conversation (
  p_conversation uuid,
  p_added        integer
)
returns void
language sql
set search_path = public
as $fn$
  update public.conversations
     set message_count = message_count + p_added,
         updated_at    = now()
   where id = p_conversation;
$fn$;

revoke all on function public.bump_conversation(uuid, integer)
  from public, anon, authenticated;

-- ── Starting configuration ──────────────────────────────────────────────────
--
-- Deliberately thin. Only the settings that must exist before the first request
-- are seeded, and not one model slug is written here: see the note on
-- model_config.active_model.
--
-- The system prompt is NOT seeded from SQL either. Its text lives in
-- lib/ai/persona.ts as the factory default and is inserted into prompt_versions
-- the first time the engine finds the table empty. One copy, in the place that
-- is version-controlled and reviewed; the database stays the source of truth
-- from then on, so an edit in the admin panel is never overwritten by a deploy.

insert into public.model_config (channel, provider, active_model, temperature, max_tokens)
select null, 'openrouter', null, 0.30, 1024
where not exists (select 1 from public.model_config where channel is null);

insert into public.embedding_config (
  is_active, provider, model, dimensions,
  chunk_size, chunk_overlap, chunking_strategy,
  top_k, similarity_threshold, reranker_enabled
)
select true, 'openai', 'text-embedding-3-large', 1536, 500, 50, 'recursive', 6, 0.300, false
where not exists (select 1 from public.embedding_config where is_active);

-- Empty allowed_domains on the widget row is not an oversight: an allowlist
-- that starts permissive is one nobody ever tightens.
insert into public.channel_settings (channel, enabled)
select c, true
from (values ('web'), ('widget'), ('telegram')) as v (c)
where not exists (select 1 from public.channel_settings where channel = v.c);
