import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const OTTO_WEBHOOK_SECRET = Deno.env.get("OTTO_WEBHOOK_SECRET") ?? "";
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
const ELEVENLABS_MODEL_ID = Deno.env.get("ELEVENLABS_MODEL_ID") ?? "eleven_multilingual_v2";
const ELEVENLABS_APP_VOICE_ID = Deno.env.get("ELEVENLABS_APP_VOICE_ID") ?? "";
const ELEVENLABS_CALL_VOICE_ID = Deno.env.get("ELEVENLABS_CALL_VOICE_ID") ?? ELEVENLABS_APP_VOICE_ID;
const ELEVENLABS_CALLBACK_VOICE_ID = Deno.env.get("ELEVENLABS_CALLBACK_VOICE_ID") ?? ELEVENLABS_APP_VOICE_ID;

type VoiceMode = "app" | "call" | "callback";

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function pickVoiceId(mode: VoiceMode) {
  if (mode === "call") {
    return ELEVENLABS_CALL_VOICE_ID;
  }

  if (mode === "callback") {
    return ELEVENLABS_CALLBACK_VOICE_ID;
  }

  return ELEVENLABS_APP_VOICE_ID;
}

async function requireAuth(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new HttpError(500, "Supabase environment is not configured.");
  }

  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    throw new HttpError(401, "Authentication required.");
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new HttpError(401, "Invalid session.");
  }
}

async function synthesize(text: string, mode: VoiceMode) {
  if (!ELEVENLABS_API_KEY) {
    throw new HttpError(500, "ELEVENLABS_API_KEY not configured.");
  }

  const voiceId = pickVoiceId(mode);

  if (!voiceId) {
    throw new HttpError(500, "ElevenLabs voice id not configured.");
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL_ID,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
      },
    }),
  });

  if (!response.ok) {
    console.error("elevenlabs_tts_error", response.status, await response.text());
    throw new HttpError(502, "ElevenLabs could not synthesize audio.");
  }

  return response.arrayBuffer();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let text = "";
    let mode: VoiceMode = "app";

    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");

      if (!token || token !== OTTO_WEBHOOK_SECRET) {
        throw new HttpError(401, "Invalid token.");
      }

      text = (url.searchParams.get("text") ?? "").trim();
      const requestedMode = url.searchParams.get("mode");
      mode = requestedMode === "call" || requestedMode === "callback" ? requestedMode : "app";
    } else {
      await requireAuth(req);
      const body = await req.json();
      text = typeof body?.text === "string" ? body.text.trim() : "";
      const requestedMode = body?.mode;
      mode = requestedMode === "call" || requestedMode === "callback" ? requestedMode : "app";
    }

    if (!text) {
      throw new HttpError(400, "Text is required.");
    }

    const audio = await synthesize(text, mode);

    return new Response(audio, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (error) {
    console.error("otto_voice_error", error);

    if (error instanceof HttpError) {
      return new Response(error.message, { status: error.status, headers: corsHeaders });
    }

    return new Response(error instanceof Error ? error.message : "Unknown error", {
      status: 500,
      headers: corsHeaders,
    });
  }
});
