import { supabase } from "@/shared/supabase/client";
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
    throw new Error(error.message || "Failed to analyze");
  }

  if (!data?.success) {
    throw new Error(data?.error || "Analysis failed");
  }

  return data.data as OttoTurnResponse;
}
