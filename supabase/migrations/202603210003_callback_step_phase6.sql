alter table public.otto_task_steps
  drop constraint if exists otto_task_steps_step_type_check;

alter table public.otto_task_steps
  add constraint otto_task_steps_step_type_check
  check (step_type in ('call_business', 'send_business_email', 'send_user_email', 'callback_user'));
