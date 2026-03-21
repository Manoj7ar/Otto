import { supabase } from "@/shared/supabase/client";
import type { OttoCallProposal } from "../types";

export async function approveOttoTask(query: string, subject: string, callProposal: OttoCallProposal): Promise<string> {
  const { data, error } = await supabase.functions.invoke("otto-call-task", {
    body: {
      query,
      subject,
      callProposal,
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
