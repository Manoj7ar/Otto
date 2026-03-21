import { supabase } from "@/shared/supabase/client";

export async function resolveTaskApproval(taskId: string, approvalId: string, decision: "approved" | "declined") {
  const { data, error } = await supabase.functions.invoke("otto-task-approval", {
    body: {
      taskId,
      approvalId,
      decision,
    },
  });

  if (error) {
    throw new Error(error.message || "Could not resolve the approval.");
  }

  if (!data?.success) {
    throw new Error(data?.error || "Could not resolve the approval.");
  }
}
