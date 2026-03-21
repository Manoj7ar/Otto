import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER") ?? "";
const OTTO_WEBHOOK_SECRET = Deno.env.get("OTTO_WEBHOOK_SECRET") ?? "";

type TaskStatus = "queued" | "dialing" | "in_progress" | "completed" | "failed" | "canceled";
type DecisionStatus = "continue" | "complete" | "failed";

interface TaskRow {
  id: string;
  status: TaskStatus;
  task_type: "verification" | "booking";
  subject: string;
  business_name: string;
  business_phone: string | null;
  business_website: string | null;
  call_goal: string;
  approval_summary: string;
  approved_scope: string[];
  request_query: string;
  result_summary: string | null;
  result_structured: Record<string, unknown>;
  conversation_log: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  twilio_call_sid: string | null;
  callback_call_sid: string | null;
}

interface GeminiDecision {
  status: DecisionStatus;
  nextQuestion: string;
  resultSummary: string;
  facts: Array<{ label: string; value: string }>;
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const decisionSchema = {
  type: "OBJECT",
  properties: {
    status: { type: "STRING", enum: ["continue", "complete", "failed"] },
    nextQuestion: { type: "STRING" },
    resultSummary: { type: "STRING" },
    facts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          value: { type: "STRING" },
        },
        required: ["label", "value"],
      },
    },
  },
  required: ["status", "nextQuestion", "resultSummary", "facts"],
};

function serviceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(500, "Supabase service role is not configured.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function xml(text: string) {
  return new Response(text, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/xml",
    },
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

function buildVoiceUrl(text: string, mode: "call" | "callback" = "call") {
  const url = new URL(`${SUPABASE_URL}/functions/v1/otto-voice`);
  url.searchParams.set("text", text);
  url.searchParams.set("mode", mode);
  url.searchParams.set("token", OTTO_WEBHOOK_SECRET);
  return url.toString();
}

function buildGatherResponse(taskId: string, prompt: string, turn: number) {
  const actionUrl = `${SUPABASE_URL}/functions/v1/otto-call-webhook?taskId=${encodeURIComponent(taskId)}&token=${encodeURIComponent(OTTO_WEBHOOK_SECRET)}&step=gather&turn=${turn}`;

  return xml(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${escapeXml(buildVoiceUrl(prompt, "call"))}</Play><Gather input="speech" speechTimeout="auto" timeout="5" method="POST" action="${escapeXml(actionUrl)}" language="en-US" /></Response>`,
  );
}

function getGeminiText(response: unknown): string {
  const data = typeof response === "object" && response !== null ? response as Record<string, unknown> : {};
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const firstCandidate =
    candidates.length > 0 && typeof candidates[0] === "object" && candidates[0] !== null
      ? candidates[0] as Record<string, unknown>
      : null;
  const content =
    firstCandidate && typeof firstCandidate.content === "object" && firstCandidate.content !== null
      ? firstCandidate.content as Record<string, unknown>
      : null;
  const parts = content && Array.isArray(content.parts) ? content.parts : [];
  const text = parts
    .map((part) => {
      const row = typeof part === "object" && part !== null ? part as Record<string, unknown> : {};
      return typeof row.text === "string" ? row.text : "";
    })
    .join("")
    .trim();

  if (!text) {
    throw new HttpError(502, "Gemini returned an empty response.");
  }

  return text;
}

async function callGeminiDecision(task: TaskRow, latestSpeech: string): Promise<GeminiDecision> {
  if (!GEMINI_API_KEY) {
    throw new HttpError(500, "GEMINI_API_KEY not configured.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: [
              "You are Otto, a conservative cloud phone agent.",
              "Decide whether to continue, complete, or fail the business call.",
              "Never ask for payment data or improvise outside approved_scope.",
              "Return complete when the business clearly answered the task.",
              "Return failed when the business response is unclear, requests outside-scope information, or the task cannot continue safely.",
            ].join("\n"),
          }],
        },
        contents: [{
          role: "user",
          parts: [{
            text: JSON.stringify({
              taskType: task.task_type,
              callGoal: task.call_goal,
              approvalSummary: task.approval_summary,
              approvedScope: task.approved_scope,
              questionPlan: (task.metadata?.questions as string[] | undefined) ?? [],
              priorConversation: task.conversation_log,
              latestSpeech,
            }),
          }],
        }],
        generationConfig: {
          temperature: 0.2,
          candidateCount: 1,
          maxOutputTokens: 900,
          responseMimeType: "application/json",
          responseSchema: decisionSchema,
        },
      }),
    },
  );

  if (!response.ok) {
    console.error("gemini_call_decision_error", response.status, await response.text());
    throw new HttpError(502, "Gemini could not evaluate the call turn.");
  }

  const payload = await response.json();
  const text = getGeminiText(payload);
  const parsed = JSON.parse(text) as GeminiDecision;

  return {
    status: parsed.status === "complete" || parsed.status === "failed" ? parsed.status : "continue",
    nextQuestion: cleanText(parsed.nextQuestion),
    resultSummary: cleanText(parsed.resultSummary),
    facts: Array.isArray(parsed.facts)
      ? parsed.facts
        .map((fact) => ({
          label: cleanText(fact?.label),
          value: cleanText(fact?.value),
        }))
        .filter((fact) => fact.label && fact.value)
      : [],
  };
}

async function getTask(taskId: string) {
  const client = serviceClient();
  const { data, error } = await client
    .from("otto_tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();

  if (error || !data) {
    throw new HttpError(404, "Task not found.");
  }

  return { client, task: data as TaskRow };
}

async function updateTask(taskId: string, values: Record<string, unknown>) {
  const client = serviceClient();
  await client.from("otto_tasks").update(values).eq("id", taskId);
}

async function createCallbackCall(task: TaskRow, summary: string) {
  const callbackPhone = cleanText(task.metadata?.callbackPhone);
  const callbackEnabled = Boolean(task.metadata?.callbackEnabled);

  if (!callbackEnabled || !callbackPhone || task.callback_call_sid) {
    return;
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${escapeXml(buildVoiceUrl(summary, "callback"))}</Play><Hangup/></Response>`;
  const params = new URLSearchParams({
    From: TWILIO_PHONE_NUMBER,
    To: callbackPhone,
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
    console.error("callback_call_error", await response.text());
    return;
  }

  const call = await response.json();
  await updateTask(task.id, { callback_call_sid: cleanText(call.sid) });
}

function openingPrompt(task: TaskRow) {
  return `Hello, this is Otto calling for a customer. I would like to ${task.task_type === "booking" ? "check whether you can help with a booking" : "verify a few details"} about ${task.subject}. ${task.call_goal}. Can you help me with that?`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const taskId = cleanText(url.searchParams.get("taskId"));
    const token = cleanText(url.searchParams.get("token"));
    const step = cleanText(url.searchParams.get("step"));
    const turn = Number(url.searchParams.get("turn") ?? "1");

    if (!taskId || !token || token !== OTTO_WEBHOOK_SECRET) {
      throw new HttpError(401, "Invalid webhook token.");
    }

    const { task } = await getTask(taskId);

    if (step === "intro") {
      await updateTask(taskId, { status: "in_progress" });
      return buildGatherResponse(taskId, openingPrompt(task), 1);
    }

    if (step === "status") {
      const form = await req.formData();
      const callStatus = cleanText(form.get("CallStatus"));
      const nextStatus: TaskStatus =
        callStatus === "completed"
          ? task.status
          : callStatus === "in-progress" || callStatus === "answered"
            ? "in_progress"
            : callStatus === "ringing"
              ? "dialing"
              : callStatus === "busy" || callStatus === "failed" || callStatus === "no-answer"
                ? "failed"
                : task.status;

      await updateTask(taskId, { status: nextStatus });
      return new Response("ok", { headers: corsHeaders });
    }

    if (step !== "gather") {
      throw new HttpError(400, "Unknown webhook step.");
    }

    const form = await req.formData();
    const latestSpeech = cleanText(form.get("SpeechResult"));
    const conversationLog = Array.isArray(task.conversation_log) ? [...task.conversation_log] : [];

    if (latestSpeech) {
      conversationLog.push({
        role: "business",
        text: latestSpeech,
        at: new Date().toISOString(),
      });
    }

    if (!latestSpeech && turn >= 2) {
      const summary = "The business line did not provide a clear spoken response, so Otto stopped the task safely.";
      await updateTask(taskId, {
        status: "failed",
        result_summary: summary,
        completed_at: new Date().toISOString(),
        conversation_log: conversationLog,
      });
      await createCallbackCall(task, summary);
      return xml(`<?xml version="1.0" encoding="UTF-8"?><Response><Play>${escapeXml(buildVoiceUrl("No problem. I will stop here for now. Goodbye.", "call"))}</Play><Hangup/></Response>`);
    }

    if (!latestSpeech) {
      return buildGatherResponse(taskId, "I did not catch that. Could you repeat that once more?", turn + 1);
    }

    const decision = await callGeminiDecision(
      {
        ...task,
        conversation_log: conversationLog,
      },
      latestSpeech,
    );

    if (decision.status === "continue" && turn < 3 && decision.nextQuestion) {
      conversationLog.push({
        role: "agent",
        text: decision.nextQuestion,
        at: new Date().toISOString(),
      });

      await updateTask(taskId, {
        status: "in_progress",
        conversation_log: conversationLog,
        result_structured: {
          facts: decision.facts,
        },
      });

      return buildGatherResponse(taskId, decision.nextQuestion, turn + 1);
    }

    const finalStatus: TaskStatus = decision.status === "failed" ? "failed" : "completed";
    const finalSummary = cleanText(
      decision.resultSummary,
      finalStatus === "completed"
        ? "Otto completed the business call and captured the result."
        : "Otto stopped the task because the call could not be completed safely.",
    );

    await updateTask(taskId, {
      status: finalStatus,
      result_summary: finalSummary,
      result_structured: {
        facts: decision.facts,
      },
      completed_at: new Date().toISOString(),
      conversation_log: conversationLog,
    });

    await createCallbackCall(task, finalSummary);

    return xml(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${escapeXml(buildVoiceUrl("Thank you. That is all I needed today. Goodbye.", "call"))}</Play><Hangup/></Response>`,
    );
  } catch (error) {
    console.error("otto_call_webhook_error", error);

    if (error instanceof HttpError) {
      return new Response(error.message, { status: error.status, headers: corsHeaders });
    }

    return new Response(error instanceof Error ? error.message : "Unknown error", {
      status: 500,
      headers: corsHeaders,
    });
  }
});
