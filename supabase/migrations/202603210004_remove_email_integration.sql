drop policy if exists "Users can view own task emails" on public.otto_task_emails;
drop table if exists public.otto_task_emails;

alter table public.otto_task_steps
  drop column if exists recipient_email,
  drop column if exists email_subject,
  drop column if exists email_body;

alter table public.otto_task_steps
  drop constraint if exists otto_task_steps_step_type_check;

alter table public.otto_task_steps
  add constraint otto_task_steps_step_type_check
  check (step_type in ('call_business', 'callback_user'));
