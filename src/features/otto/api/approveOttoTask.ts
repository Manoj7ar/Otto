import { supabase } from "@/shared/supabase/client";
import type { OttoProposedTask } from "../types";

export async function approveOttoTask(query: string, subject: string, proposal: OttoProposedTask): Promise<string> {
  const { data, error } = await supabase.functions.invoke("otto-call-task", {
    body: {
      query,
      subject,
      proposal,
    },
  });

  if (error) {
    throw new Error(error.message || "Failed to create call task.");
  }

  if (!data?.success) {
    throw new Error(data?.error || "Failed to create call task.");
  }

  return String(data.data?.taskId ?? "");
}
