create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  home_location text not null,
  current_region text not null,
  language_code text not null default 'en',
  timezone text not null default 'UTC',
  travel_mode text not null default 'walking',
  callback_phone text,
  call_briefing_enabled boolean not null default true,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.otto_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'dialing', 'in_progress', 'completed', 'failed', 'canceled')),
  task_type text not null check (task_type in ('verification', 'booking')),
  subject text not null,
  business_name text not null,
  business_phone text,
  business_website text,
  call_goal text not null,
  approval_summary text not null,
  approved_scope text[] not null default '{}'::text[],
  request_query text not null,
  result_summary text,
  result_structured jsonb not null default '{}'::jsonb,
  conversation_log jsonb not null default '[]'::jsonb,
  source_snapshot jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  twilio_call_sid text,
  callback_call_sid text,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute procedure public.set_updated_at();

drop trigger if exists set_otto_tasks_updated_at on public.otto_tasks;
create trigger set_otto_tasks_updated_at
before update on public.otto_tasks
for each row
execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.otto_tasks enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can view own tasks" on public.otto_tasks;
create policy "Users can view own tasks"
on public.otto_tasks
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own tasks" on public.otto_tasks;
create policy "Users can insert own tasks"
on public.otto_tasks
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own tasks" on public.otto_tasks;
create policy "Users can update own tasks"
on public.otto_tasks
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
