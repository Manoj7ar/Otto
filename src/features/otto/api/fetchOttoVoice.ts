import { supabase } from "@/shared/supabase/client";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

export async function fetchOttoVoice(text: string, mode: "app" | "call" | "callback" = "app") {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${supabaseUrl}/functions/v1/otto-voice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ text, mode }),
  });

  if (!response.ok) {
    throw new Error("Failed to generate voice audio.");
  }

  return response.blob();
}
