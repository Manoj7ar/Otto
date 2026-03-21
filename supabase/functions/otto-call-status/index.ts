import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  authenticateUser,
  createServiceClient,
  HttpError,
} from "../_shared/otto-concierge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-otto-auth, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchTaskForUser(taskId: string, userId: string) {
  const client = createServiceClient();
  const { data, error } = await client
    .from("otto_tasks")
    .select("id, user_id, twilio_call_sid, callback_call_sid, business_name, business_phone, callback_call_sid")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new HttpError(404, "Task not found.");
  }

  return data;
}

async function fetchTwilioCall(callSid: string) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new HttpError(500, "Twilio is not configured.");
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_ACCOUNT_SID)}/Calls/${encodeURIComponent(callSid)}.json`,
    {
      headers: {
        Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
      },
    },
  );

  if (!response.ok) {
    throw new HttpError(response.status, `Twilio lookup failed with status ${response.status}.`);
  }

  return await response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const user = await authenticateUser(req);
    const url = new URL(req.url);
    const taskId = url.searchParams.get("taskId")?.trim() ?? "";
    const mode = url.searchParams.get("mode")?.trim() === "callback" ? "callback" : "business";

    if (!taskId) {
      throw new HttpError(400, "taskId is required.");
    }

    const task = await fetchTaskForUser(taskId, user.id);
    const callSid = mode === "callback" ? task.callback_call_sid : task.twilio_call_sid;

    if (!callSid) {
      throw new HttpError(404, `No ${mode} call SID is recorded for this task.`);
    }

    const twilioCall = await fetchTwilioCall(callSid);
    return jsonResponse({
      success: true,
      data: {
        taskId: task.id,
        mode,
        callSid,
        twilioCall,
      },
    });
  } catch (error) {
    console.error("otto_call_status_error", error);

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }

    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
