alter table public.otto_tasks
  drop constraint if exists otto_tasks_task_type_check;

alter table public.otto_tasks
  add constraint otto_tasks_task_type_check
  check (task_type in ('verification', 'booking', 'concierge'));

alter table public.otto_tasks
  add column if not exists title text not null default '',
  add column if not exists latest_summary text,
  add column if not exists latest_step_label text,
  add column if not exists inbox_state text not null default 'active';

alter table public.otto_tasks
  drop constraint if exists otto_tasks_inbox_state_check;

alter table public.otto_tasks
  add constraint otto_tasks_inbox_state_check
  check (inbox_state in ('active', 'waiting_approval', 'completed', 'failed', 'canceled'));

create table if not exists public.otto_task_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.otto_tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  step_order integer not null,
  step_type text not null check (step_type in ('call_business', 'send_business_email', 'send_user_email')),
  title text not null,
  status text not null default 'pending' check (status in ('pending', 'waiting_approval', 'approved', 'declined', 'running', 'completed', 'failed', 'skipped')),
  approval_required boolean not null default true,
  approval_summary text,
  recipient_name text,
  recipient_email text,
  recipient_phone text,
  email_subject text,
  email_body text,
  payload jsonb not null default '{}'::jsonb,
  result_summary text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create unique index if not exists otto_task_steps_task_id_step_order_idx
  on public.otto_task_steps (task_id, step_order);

create table if not exists public.otto_task_approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.otto_tasks (id) on delete cascade,
  step_id uuid not null references public.otto_task_steps (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  summary text not null,
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz
);

create table if not exists public.otto_task_emails (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.otto_tasks (id) on delete cascade,
  step_id uuid references public.otto_task_steps (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  direction text not null check (direction in ('user_update', 'business_outreach')),
  recipient_name text,
  recipient_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz
);

drop trigger if exists set_otto_task_steps_updated_at on public.otto_task_steps;
create trigger set_otto_task_steps_updated_at
before update on public.otto_task_steps
for each row
execute procedure public.set_updated_at();

alter table public.otto_task_steps enable row level security;
alter table public.otto_task_approvals enable row level security;
alter table public.otto_task_emails enable row level security;

drop policy if exists "Users can view own task steps" on public.otto_task_steps;
create policy "Users can view own task steps"
on public.otto_task_steps
for select
using (auth.uid() = user_id);

drop policy if exists "Users can view own task approvals" on public.otto_task_approvals;
create policy "Users can view own task approvals"
on public.otto_task_approvals
for select
using (auth.uid() = user_id);

drop policy if exists "Users can view own task emails" on public.otto_task_emails;
create policy "Users can view own task emails"
on public.otto_task_emails
for select
using (auth.uid() = user_id);
