import { supabase } from "@/shared/supabase/client";
import type { OttoSessionContext, OttoTurnResponse } from "../types";

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

export async function submitOttoTurn(
  query: string,
  imageBase64?: string,
  sessionContext?: OttoSessionContext
): Promise<OttoTurnResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("No active Supabase session. Sign in again and retry.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/otto-analyze`, {
    method: "POST",
    headers: {
      apikey: supabasePublishableKey,
      "Content-Type": "application/json",
      "x-otto-auth": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      query,
      imageBase64,
      sessionContext,
    }),
  });

  if (!response.ok) {
    throw new Error(await readFunctionError(response, "Failed to analyze"));
  }

  const data = await response.json();

  if (!data?.success) {
    throw new Error(data?.error || "Analysis failed");
  }

  return data.data as OttoTurnResponse;
}
