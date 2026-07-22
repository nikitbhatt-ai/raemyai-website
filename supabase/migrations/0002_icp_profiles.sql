-- Per-client Ideal Customer Profile (ICP).
-- The Hunter agent reads this row for each client and injects the
-- description into its system prompt so lead qualification is
-- client-specific. Onboarding a new client means inserting a row
-- here, never a code deploy.
--
-- One ICP per client (unique on client_id). If we ever need multiple
-- ICPs per client, drop the unique constraint and add a name column.

create table if not exists public.icp_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.icp_profiles enable row level security;

-- Keep updated_at fresh on modifications.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists icp_profiles_set_updated_at on public.icp_profiles;
create trigger icp_profiles_set_updated_at
before update on public.icp_profiles
for each row execute function public.set_updated_at();
