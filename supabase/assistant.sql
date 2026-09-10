-- Arkan AI assistant — schema.
--
-- Already applied to the live project as the 20260910 migrations. This file is
-- the readable copy: run it on a fresh project to reach the same state. It is
-- separate from schema.sql, which owns the website form alone.
--
-- SECURITY MODEL, in one line: every table below has RLS enabled and NOT ONE
-- policy, so a publishable key reaches nothing at all. The server uses the
-- service role key, which bypasses RLS. That is why SUPABASE_SERVICE_ROLE_KEY
-- is required for the assistant when it was optional for the form.

create extension if not exists vector with schema extensions;

-- ── Knowledge base ──────────────────────────────────────────────────────────
--
-- 1536 dimensions, not the model default of 3072: pgvector indexes `vector`
-- only up to 2,000, so 3072 would force a sequential scan or a halfvec cast on
-- every query. 1536 is one of the dimensions Google recommends for
-- gemini-embedding-2, and that model is Matryoshka-trained, so truncating to it
-- is a supported operation rather than a lossy one.

create table if not exists public.documents (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null    default now(),
  updated_at   timestamptz not null    default now(),
  title        text        not null,
  source_type  text        not null    check (source_type in ('pdf','docx','text','url')),
  source_url   text,
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
  -- Which model produced this vector: lets a migration find a stale index after
  -- an embedding-model change instead of guessing.
  model       text        not null,
  dimensions  integer     not null,
  embedding   extensions.vector(1536),
  metadata    jsonb       not null    default '{}',
  unique (document_id, chunk_index)
);

create index if not exists chunks_document_idx on public.chunks (document_id);

-- HNSW over cosine distance. Safe to build on an empty table, unlike ivfflat,
-- and it stays balanced as documents are added.
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
  unique (channel, external_id)
);

create table if not exists public.conversations (
  id         uuid        primary key default gen_random_uuid(),
  started_at timestamptz not null    default now(),
  updated_at timestamptz not null    default now(),
  channel    text        not null    check (channel in ('web','widget','telegram')),
  user_id    uuid        references public.unified_users (id) on delete set null,
  status     text        not null    default 'active'
                         check (status in ('active','needs_human','human_active','closed')),
  -- Rolling summary of turns already dropped from the live window, so a long
  -- conversation stays inside the context limit without losing its thread.
  summary    text,
  title      text
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
  tokens_in           integer,
  tokens_out          integer,
  cost_usd            numeric(12, 6),
  retrieved_chunk_ids uuid[]      not null    default '{}',
  latency_ms          integer,
  error               text
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
create index if not exists messages_model_idx        on public.messages (model_used, created_at desc)
  where model_used is not null;

create table if not exists public.feedback (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null    default now(),
  message_id uuid        not null    references public.messages (id) on delete cascade,
  rating     smallint    not null    check (rating in (-1, 1)),
  comment    text,
  unique (message_id)
);

create index if not exists feedback_rating_idx on public.feedback (rating, created_at desc);

-- ── Configuration and admin ─────────────────────────────────────────────────
--
-- Everything an operator can tune lives here, never in code: the persona and
-- the active model must be editable from the admin panel without a deploy.

create table if not exists public.prompt_versions (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null    default now(),
  created_by uuid,
  label      text,
  content    text        not null,
  persona    text,
  is_active  boolean     not null    default false
);

-- At most one active prompt, enforced by the database rather than by trusting
-- every write path to remember.
create unique index if not exists prompt_versions_one_active_idx
  on public.prompt_versions (is_active) where is_active;

create table if not exists public.model_config (
  id                 uuid         primary key default gen_random_uuid(),
  updated_at         timestamptz  not null default now(),
  -- null = the default for any channel without its own row.
  channel            text         unique check (channel in ('web','widget','telegram')),
  provider           text         not null default 'openrouter',
  active_model       text         not null,
  fallback_model     text,
  temperature        numeric(3,2) not null default 0.30 check (temperature between 0 and 2),
  max_tokens         integer      not null default 1024 check (max_tokens > 0),
  top_p              numeric(3,2) not null default 1.00 check (top_p between 0 and 1),
  -- Entries of {days:[1,2], from:"09:00", to:"17:00", model:"..."}, evaluated
  -- before active_model so a schedule overrides it by day and time range.
  schedule           jsonb        not null default '[]',
  monthly_budget_usd numeric(10,2)
);

create table if not exists public.embedding_config (
  id                   uuid         primary key default gen_random_uuid(),
  updated_at           timestamptz  not null default now(),
  is_active            boolean      not null default false,
  provider             text         not null check (provider in ('google','openai','cohere','voyage')),
  model                text         not null,
  dimensions           integer      not null,
  chunk_size           integer      not null default 500,
  chunk_overlap        integer      not null default 50,
  top_k                integer      not null default 6,
  similarity_threshold numeric(4,3) not null default 0.300,
  reranker_enabled     boolean      not null default false,
  reranker_model       text
);

create unique index if not exists embedding_config_one_active_idx
  on public.embedding_config (is_active) where is_active;

create table if not exists public.admin_users (
  id         uuid        primary key,   -- mirrors auth.users.id
  created_at timestamptz not null default now(),
  email      text        not null unique,
  role       text        not null default 'read_only'
                         check (role in ('owner','admin','editor','operator','read_only'))
);

create table if not exists public.audit_log (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null    default now(),
  admin_user_id uuid        references public.admin_users (id) on delete set null,
  action        text        not null,
  target        text,
  detail        jsonb       not null    default '{}'
);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

-- The website form and the assistant write the same leads table. `source` says
-- which, and conversation_id opens the conversation that produced a lead.
-- Existing rows predate the assistant, so 'website' is right for them.
alter table public.leads
  add column if not exists source          text not null default 'website',
  add column if not exists conversation_id uuid references public.conversations (id) on delete set null;

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_source_check') then
    alter table public.leads
      add constraint leads_source_check check (source in ('website','chatbot','telegram','widget'));
  end if;
end $do$;

create index if not exists leads_source_idx on public.leads (source, created_at desc);

-- ── Row level security: deny by default ─────────────────────────────────────
--
-- No policies follow on purpose. See the note at the top of this file.

alter table public.documents        enable row level security;
alter table public.chunks           enable row level security;
alter table public.conversations    enable row level security;
alter table public.messages         enable row level security;
alter table public.unified_users    enable row level security;
alter table public.feedback         enable row level security;
alter table public.prompt_versions  enable row level security;
alter table public.model_config     enable row level security;
alter table public.embedding_config enable row level security;
alter table public.admin_users      enable row level security;
alter table public.audit_log        enable row level security;

-- ── Retrieval ───────────────────────────────────────────────────────────────
--
-- supabase-js cannot express the `<=>` operator, so similarity search goes
-- through this function. `threshold` filters on similarity, not distance, so a
-- higher number is stricter — the direction an operator expects from a slider
-- labelled "similarity threshold".

create or replace function public.match_chunks (
  query_embedding extensions.vector(1536),
  match_count     integer default 6,
  threshold       double precision default 0.3
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
    and 1 - (c.embedding operator(extensions.<=>) query_embedding) >= threshold
  order by c.embedding operator(extensions.<=>) query_embedding
  limit greatest(match_count, 1);
$fn$;

-- PostgREST exposes public functions to anon by default, and this one reads the
-- whole knowledge base. The server calls it as service_role.
revoke all on function public.match_chunks(extensions.vector, integer, double precision)
  from public, anon, authenticated;

-- ── Starting configuration ──────────────────────────────────────────────────
--
-- Model slugs are verified against the live OpenRouter catalog rather than
-- written from memory. gemini-2.5-flash-lite is the default because RAG answers
-- are long-context and high-volume; gpt-5-nano is the fallback for when Google
-- errors or rate-limits.

insert into public.model_config (channel, provider, active_model, fallback_model, temperature, max_tokens)
select null, 'openrouter', 'google/gemini-2.5-flash-lite', 'openai/gpt-5-nano', 0.30, 1024
where not exists (select 1 from public.model_config where channel is null);

insert into public.embedding_config (
  is_active, provider, model, dimensions,
  chunk_size, chunk_overlap, top_k, similarity_threshold, reranker_enabled
)
select true, 'google', 'gemini-embedding-2', 1536, 500, 50, 6, 0.300, false
where not exists (select 1 from public.embedding_config where is_active);

-- The persona is seeded by migration 20260910_chatbot_seed_config_and_persona,
-- which holds the full text. It is the brand guide turned into instructions:
-- Sage plus Caregiver, short direct sentences, reassurance without promises,
-- and the standing rule that Arkan never guarantees an outcome.
