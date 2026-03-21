import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateUser, HttpError, normalizePhone } from "../_shared/otto-concierge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-otto-auth, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER") ?? "";
const OTTO_WEBHOOK_SECRET = Deno.env.get("OTTO_WEBHOOK_SECRET") ?? "";

interface DemoCallbackRequest {
  phone?: unknown;
  name?: unknown;
  script?: unknown;
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeXml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildVoiceUrl(text: string) {
  const url = new URL(`${SUPABASE_URL}/functions/v1/otto-voice`);
  url.searchParams.set("text", text);
  url.searchParams.set("mode", "callback");
  url.searchParams.set("token", OTTO_WEBHOOK_SECRET);
  return url.toString();
}

async function createTwilioCall(twiml: string, phone: string) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER || !OTTO_WEBHOOK_SECRET || !SUPABASE_URL) {
    throw new HttpError(500, "Twilio callback environment is not configured.");
  }

  const params = new URLSearchParams({
    From: TWILIO_PHONE_NUMBER,
    To: phone,
    Twiml: twiml,
  });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    console.error("twilio_demo_callback_error", response.status, await response.text());
    throw new HttpError(502, "Twilio could not start the demo callback.");
  }

  return await response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await authenticateUser(req);

    const body = await req.json() as DemoCallbackRequest;
    const phone = normalizePhone(body.phone);
    const name = cleanText(body.name, "there");
    const script = cleanText(
      body.script,
      `Hi ${name}, this is Otto with your update. Your restaurant booking is confirmed for tomorrow at 4 PM for 3 people.`,
    );

    if (!phone) {
      throw new HttpError(400, "A valid phone number is required.");
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${escapeXml(buildVoiceUrl(script))}</Play><Hangup/></Response>`;
    const call = await createTwilioCall(twiml, phone);

    return jsonResponse({
      success: true,
      data: {
        callSid: cleanText(call.sid),
        phone,
        script,
      },
    });
  } catch (error) {
    console.error("otto_demo_callback_error", error);

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }

    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
