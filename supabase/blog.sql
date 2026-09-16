-- ============================================================================
-- Arkan — autonomous blog pipeline
--
-- Run this in the Supabase SQL editor. It is additive: it touches none of the
-- website, assistant or admin tables.
--
-- Table names are prefixed `blog_` because `feedback` is already taken by the
-- assistant. Two systems sharing a table name is the kind of collision that
-- only shows up in production, on the row that matters.
--
-- یادداشت آموزشی: هر چهار جدول RLS دارند و هیچ policy ندارند. یعنی کلید عمومی
-- مرورگر به هیچ‌کدام نمی‌رسد و تنها راه دسترسی، SUPABASE_SERVICE_ROLE_KEY سمت
-- سرور است. انتشار محتوا و حافظه‌ی خودبهبودی، چیزهایی نیستند که با کلیدی که در
-- باندل مرورگر می‌نشیند قابل نوشتن باشند.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Runs ────────────────────────────────────────────────────────────────────
-- One row per pipeline execution. `steps` is jsonb rather than a child table on
-- purpose: a step is only ever read as part of its run, is written a dozen times
-- during the run, and its shape changes whenever an agent is added. A normalised
-- table would buy nothing and cost a migration every time the pipeline changes.
create table if not exists public.blog_runs (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'running'
                check (status in ('running', 'done', 'error')),
  topic_hint  text,
  steps       jsonb not null default '[]'::jsonb,
  post_id     uuid,
  error       text,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists blog_runs_created_idx
  on public.blog_runs (created_at desc);

-- ── Posts ───────────────────────────────────────────────────────────────────
-- `slug` is unique because it is the public URL. The pipeline resolves
-- collisions before inserting (ensureUniqueSlug), and this constraint is what
-- makes that resolution mandatory rather than optional.
create table if not exists public.blog_posts (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid references public.blog_runs (id) on delete set null,
  title            text not null,
  slug             text not null unique,
  excerpt          text not null default '',
  content_md       text not null,
  meta_title       text not null default '',
  meta_description text not null default '',
  keywords         jsonb not null default '[]'::jsonb,
  faq              jsonb not null default '[]'::jsonb,
  score            integer not null default 0,
  status           text not null default 'draft'
                     check (status in ('draft', 'published')),
  created_at       timestamptz not null default now(),
  published_at     timestamptz
);

-- The blog index reads published posts, newest first, and nothing else.
create index if not exists blog_posts_published_idx
  on public.blog_posts (status, created_at desc);

alter table public.blog_runs
  drop constraint if exists blog_runs_post_id_fkey;
alter table public.blog_runs
  add constraint blog_runs_post_id_fkey
  foreign key (post_id) references public.blog_posts (id) on delete set null;

-- ── Lessons ─────────────────────────────────────────────────────────────────
-- The self-improvement memory. `active` rather than deletion, so a lesson that
-- is retired by the eight-per-agent cap stays visible in the studio: the history
-- of what the system taught itself is worth keeping.
create table if not exists public.blog_lessons (
  id         uuid primary key default gen_random_uuid(),
  agent      text not null
               check (agent in ('idea-scout', 'strategist', 'researcher',
                                'writer', 'editor', 'seo', 'critic')),
  lesson     text not null,
  source     text not null default 'critic' check (source in ('critic', 'human')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Every agent reads its own active lessons at the start of every run.
create index if not exists blog_lessons_agent_idx
  on public.blog_lessons (agent, active, created_at desc);

-- ── Feedback ────────────────────────────────────────────────────────────────
create table if not exists public.blog_feedback (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.blog_posts (id) on delete cascade,
  rating     text not null check (rating in ('up', 'down')),
  comment    text,
  created_at timestamptz not null default now()
);

create index if not exists blog_feedback_post_idx
  on public.blog_feedback (post_id, created_at desc);

-- ── Row level security ──────────────────────────────────────────────────────
-- Enabled, with no policy at all. Nothing but the service role can read or write
-- these tables. Do not add a policy to make something easier from the browser.
alter table public.blog_runs     enable row level security;
alter table public.blog_posts    enable row level security;
alter table public.blog_lessons  enable row level security;
alter table public.blog_feedback enable row level security;
