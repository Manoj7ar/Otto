import { supabase } from "@/shared/supabase/client";
import type { InboxTask } from "../types";
import type { OttoTaskApprovalRow, OttoTaskEmailRow, OttoTaskRow, OttoTaskStepRow } from "../types";

export async function fetchInboxTasks(userId: string): Promise<InboxTask[]> {
  const { data: tasks, error: taskError } = await supabase
    .from("otto_tasks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(25);

  if (taskError) {
    throw taskError;
  }

  const taskRows = (tasks ?? []) as OttoTaskRow[];
  const taskIds = taskRows.map((task) => task.id);

  if (taskIds.length === 0) {
    return [];
  }

  const [{ data: steps, error: stepError }, { data: approvals, error: approvalError }, { data: emails, error: emailError }] = await Promise.all([
    supabase.from("otto_task_steps").select("*").in("task_id", taskIds).order("step_order", { ascending: true }),
    supabase.from("otto_task_approvals").select("*").in("task_id", taskIds).order("created_at", { ascending: false }),
    supabase.from("otto_task_emails").select("*").in("task_id", taskIds).order("created_at", { ascending: false }),
  ]);

  if (stepError) {
    throw stepError;
  }

  if (approvalError) {
    throw approvalError;
  }

  if (emailError) {
    throw emailError;
  }

  const stepRows = (steps ?? []) as OttoTaskStepRow[];
  const approvalRows = (approvals ?? []) as OttoTaskApprovalRow[];
  const emailRows = (emails ?? []) as OttoTaskEmailRow[];

  return taskRows.map((task) => ({
    ...task,
    steps: stepRows.filter((step) => step.task_id === task.id),
    approvals: approvalRows.filter((approval) => approval.task_id === task.id),
    emails: emailRows.filter((email) => email.task_id === task.id),
  }));
}
