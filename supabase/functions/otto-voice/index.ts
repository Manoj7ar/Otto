import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { normalizeSpeechText } from "../_shared/normalize-speech.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
const ELEVENLABS_MODEL_ID = Deno.env.get("ELEVENLABS_MODEL_ID") ?? "eleven_multilingual_v2";
const ELEVENLABS_APP_VOICE_ID = Deno.env.get("ELEVENLABS_APP_VOICE_ID") ?? "";

interface VoiceRequestBody {
  text?: unknown;
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function synthesize(text: string) {
  if (!ELEVENLABS_API_KEY) {
    throw new HttpError(500, "ELEVENLABS_API_KEY not configured.");
  }

  if (!ELEVENLABS_APP_VOICE_ID) {
    throw new HttpError(500, "ElevenLabs voice id not configured.");
  }

  const spokenText = normalizeSpeechText(text);

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_APP_VOICE_ID}/stream?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text: spokenText,
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
    if (req.method !== "POST") {
      throw new HttpError(405, "Method not allowed.");
    }

    const body = await req.json() as VoiceRequestBody;
    const text = typeof body?.text === "string" ? body.text.trim() : "";

    if (!text) {
      throw new HttpError(400, "Text is required.");
    }

    const audio = await synthesize(text);

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
