import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER") ?? "";
const OTTO_WEBHOOK_SECRET = Deno.env.get("OTTO_WEBHOOK_SECRET") ?? "";

interface ProposedTask {
  taskType: "verification" | "booking";
  businessName: string;
  businessPhone: string | null;
  businessWebsite: string | null;
  callGoal: string;
  approvalSummary: string;
  approvedScope: string[];
  questions: string[];
}

interface CreateTaskRequest {
  query?: string;
  subject?: string;
  proposal?: ProposedTask;
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanStringArray(value: unknown, limit = 6): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeProposal(raw: unknown): ProposedTask | null {
  const data = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : null;

  if (!data) {
    return null;
  }

  const taskType = data.taskType === "verification" || data.taskType === "booking" ? data.taskType : null;
  const businessName = cleanText(data.businessName);
  const callGoal = cleanText(data.callGoal);
  const approvalSummary = cleanText(data.approvalSummary);

  if (!taskType || !businessName || !callGoal || !approvalSummary) {
    return null;
  }

  return {
    taskType,
    businessName,
    businessPhone: cleanText(data.businessPhone) || null,
    businessWebsite: cleanText(data.businessWebsite) || null,
    callGoal,
    approvalSummary,
    approvedScope: cleanStringArray(data.approvedScope),
    questions: cleanStringArray(data.questions, 5),
  };
}

function createServiceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(500, "Supabase service role is not configured.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function authenticateUser(req: Request) {
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

  return user;
}

async function getProfile(serviceClient: ReturnType<typeof createServiceClient>, userId: string) {
  const { data, error } = await serviceClient
    .from("profiles")
    .select("callback_phone, call_briefing_enabled, onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to load profile.");
  }

  if (!data?.onboarding_completed_at) {
    throw new HttpError(403, "Complete onboarding before creating tasks.");
  }

  return data;
}

async function createTwilioCall(taskId: string) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER || !OTTO_WEBHOOK_SECRET) {
    throw new HttpError(500, "Twilio call environment is not configured.");
  }

  const webhookBase = `${SUPABASE_URL}/functions/v1/otto-call-webhook`;
  const params = new URLSearchParams({
    Url: `${webhookBase}?taskId=${encodeURIComponent(taskId)}&token=${encodeURIComponent(OTTO_WEBHOOK_SECRET)}&step=intro`,
    StatusCallback: `${webhookBase}?taskId=${encodeURIComponent(taskId)}&token=${encodeURIComponent(OTTO_WEBHOOK_SECRET)}&step=status`,
    StatusCallbackMethod: "POST",
    From: TWILIO_PHONE_NUMBER,
    To: "",
    Record: "true",
  });
  params.append("StatusCallbackEvent", "initiated");
  params.append("StatusCallbackEvent", "ringing");
  params.append("StatusCallbackEvent", "answered");
  params.append("StatusCallbackEvent", "completed");

  return params;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const user = await authenticateUser(req);
    const { query = "", subject = "", proposal: rawProposal }: CreateTaskRequest = await req.json();
    const proposal = normalizeProposal(rawProposal);

    if (!proposal) {
      throw new HttpError(400, "A valid proposed task is required.");
    }

    if (!proposal.businessPhone) {
      throw new HttpError(400, "Otto could not verify a phone number for this task.");
    }

    const serviceClient = createServiceClient();
    const profile = await getProfile(serviceClient, user.id);

    const { data: task, error: insertError } = await serviceClient
      .from("otto_tasks")
      .insert({
        user_id: user.id,
        status: "queued",
        task_type: proposal.taskType,
        subject: cleanText(subject, proposal.businessName),
        business_name: proposal.businessName,
        business_phone: proposal.businessPhone,
        business_website: proposal.businessWebsite,
        call_goal: proposal.callGoal,
        approval_summary: proposal.approvalSummary,
        approved_scope: proposal.approvedScope,
        request_query: cleanText(query, proposal.callGoal),
        source_snapshot: [],
        conversation_log: [],
        metadata: {
          questions: proposal.questions,
          callbackPhone: profile.callback_phone,
          callbackEnabled: profile.call_briefing_enabled,
          introTurns: 0,
        },
      })
      .select("id, business_phone")
      .single();

    if (insertError || !task) {
      throw new HttpError(500, "Could not create the cloud call task.");
    }

    const params = await createTwilioCall(task.id);
    params.set("To", task.business_phone ?? proposal.businessPhone ?? "");

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("twilio_call_create_error", errorText);

      await serviceClient
        .from("otto_tasks")
        .update({
          status: "failed",
          result_summary: "Twilio could not start the business call.",
        })
        .eq("id", task.id);

      throw new HttpError(502, "Twilio could not start the business call.");
    }

    const callData = await response.json();

    await serviceClient
      .from("otto_tasks")
      .update({
        status: "dialing",
        twilio_call_sid: cleanText(callData.sid),
      })
      .eq("id", task.id);

    return jsonResponse({
      success: true,
      data: {
        taskId: task.id,
      },
    });
  } catch (error) {
    console.error("otto_call_task_error", error);

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }

    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
