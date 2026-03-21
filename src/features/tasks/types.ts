import type { Database } from "@/shared/supabase/types";

export type OttoTaskRow = Database["public"]["Tables"]["otto_tasks"]["Row"];
export type OttoTaskStepRow = Database["public"]["Tables"]["otto_task_steps"]["Row"];
export type OttoTaskApprovalRow = Database["public"]["Tables"]["otto_task_approvals"]["Row"];
export type OttoTaskEmailRow = Database["public"]["Tables"]["otto_task_emails"]["Row"];

export interface InboxTask extends OttoTaskRow {
  steps: OttoTaskStepRow[];
  approvals: OttoTaskApprovalRow[];
  emails: OttoTaskEmailRow[];
}
