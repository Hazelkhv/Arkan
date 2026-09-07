-- Arkan — consultation requests
--
-- Run once in the Supabase SQL editor. The website only ever inserts; reading
-- leads is done from the Supabase dashboard or a future authenticated tool.

create extension if not exists "pgcrypto";

create table if not exists public.leads (
  id             uuid        primary key default gen_random_uuid(),
  created_at     timestamptz not null    default now(),
  full_name      text        not null,
  phone          text        not null,
  email          text,
  business_name  text        not null,
  industry       text,
  stage          text        not null,
  challenge      text        not null,
  preferred_time text,
  status         text        not null    default 'new'
);

-- New leads first: the only way this table is ever read.
create index if not exists leads_created_at_idx
  on public.leads (created_at desc);

alter table public.leads enable row level security;

-- The public form may add a lead and nothing else. There is deliberately no
-- select, update or delete policy for anon, so a leaked anon key cannot be
-- used to read anybody's contact details back out.
drop policy if exists "anon can submit a consultation request" on public.leads;
create policy "anon can submit a consultation request"
  on public.leads
  for insert
  to anon
  with check (true);
