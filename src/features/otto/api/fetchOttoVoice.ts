import { supabasePublishableKey, supabaseUrl } from "@/shared/supabase/client";

export async function fetchOttoVoice(text: string) {
  const response = await fetch(`${supabaseUrl}/functions/v1/otto-voice`, {
    method: "POST",
    headers: {
      apikey: supabasePublishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Failed to generate voice audio.");
  }

  return response.blob();
}
