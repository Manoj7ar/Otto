import type { ProfileRow } from "@/features/account/profile";
import { supabasePublishableKey, supabaseUrl } from "@/shared/supabase/client";
import type { OttoSessionContext, OttoTurnResponse } from "../types";

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
  profile: ProfileRow,
  imageBase64?: string,
  sessionContext?: OttoSessionContext
): Promise<OttoTurnResponse> {
  const response = await fetch(`${supabaseUrl}/functions/v1/otto-analyze`, {
    method: "POST",
    headers: {
      apikey: supabasePublishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      profile,
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
