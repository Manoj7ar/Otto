import { supabase } from "@/shared/supabase/client";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export async function fetchOttoVoice(text: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${supabaseUrl}/functions/v1/otto-voice`, {
    method: "POST",
    headers: {
      apikey: supabasePublishableKey,
      "Content-Type": "application/json",
      ...(session?.access_token ? { "x-otto-auth": `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({
      text,
      accessToken: session?.access_token ?? null,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Failed to generate voice audio.");
  }

  return response.blob();
}
