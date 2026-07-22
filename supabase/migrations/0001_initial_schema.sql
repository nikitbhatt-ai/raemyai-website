-- Baseline schema for the Hunter agent.
-- Applied to Supabase project yxvfkchcooydqkalladk on 2026-07-22.
-- Recorded here so the schema is version-controlled alongside code.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  monthly_quota int not null default 300,
  tasks_this_month int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  source text,
  raw_input text not null,
  status text not null default 'new',
  fit boolean,
  score int,
  reason text,
  suggested_action text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists idx_leads_queue on public.leads (client_id, status);

create table if not exists public.usage_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  agent_id text not null,
  lead_id uuid references public.leads(id) on delete set null,
  model text not null,
  input_tokens int not null,
  output_tokens int not null,
  cost_usd numeric(10,5) not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_usage_client on public.usage_log (client_id, created_at desc);

alter table public.clients   enable row level security;
alter table public.leads     enable row level security;
alter table public.usage_log enable row level security;

-- Monthly quota reset (pg_cron)
create extension if not exists pg_cron schema pg_catalog;
select cron.schedule(
  'monthly-reset-tasks',
  '0 0 1 * *',
  $$update public.clients set tasks_this_month = 0$$
);
