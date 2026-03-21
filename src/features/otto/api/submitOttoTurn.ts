import { supabase } from "@/shared/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import type { OttoSessionContext, OttoTurnResponse } from "../types";

export async function submitOttoTurn(
  query: string,
  imageBase64?: string,
  sessionContext?: OttoSessionContext
): Promise<OttoTurnResponse> {
  const { data, error } = await supabase.functions.invoke("otto-analyze", {
    body: {
      query,
      imageBase64,
      sessionContext,
    },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = await error.context.json();
        throw new Error(payload?.error || error.message || "Failed to analyze");
      } catch {
        throw new Error(error.message || "Failed to analyze");
      }
    }

    throw new Error(error.message || "Failed to analyze");
  }

  if (!data?.success) {
    throw new Error(data?.error || "Analysis failed");
  }

  return data.data as OttoTurnResponse;
}
