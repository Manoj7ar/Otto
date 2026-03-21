import { supabase } from "@/shared/supabase/client";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function readFunctionError(response: Response, fallback: string) {
  const raw = await response.text().catch(() => "");

  if (!raw.trim()) {
    return fallback;
  }

  try {
    const payload = JSON.parse(raw) as { error?: unknown };

    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  } catch {
    return raw.trim();
  }

  return raw.trim() || fallback;
}

export async function resolveTaskApproval(taskId: string, approvalId: string, decision: "approved" | "declined") {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("No active Supabase session. Sign in again and retry.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/otto-task-approval`, {
    method: "POST",
    headers: {
      apikey: supabasePublishableKey,
      "Content-Type": "application/json",
      "x-otto-auth": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      taskId,
      approvalId,
      decision,
    }),
  });

  if (!response.ok) {
    throw new Error(await readFunctionError(response, "Could not resolve the approval."));
  }

  const data = await response.json();

  if (!data?.success) {
    throw new Error(data?.error || "Could not resolve the approval.");
  }
}
