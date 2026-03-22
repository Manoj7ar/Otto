import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  cleanText,
  createServiceClient,
  executeTaskChain,
  fetchTaskBundle,
  getConversationLog,
  HttpError,
  persistConversationLog,
} from "../_shared/otto-concierge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-otto-auth, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const OTTO_WEBHOOK_SECRET = Deno.env.get("OTTO_WEBHOOK_SECRET") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
const MAX_CALL_TURNS = 5;

interface CustomerContext {
  fullName: string | null;
  callbackPhone: string | null;
}

interface GeminiCallPlan {
  status: "continue" | "complete" | "failed";
  assistantReply: string;
  resultSummary: string;
}

const decisionSchema = {
  type: "OBJECT",
  properties: {
    status: { type: "STRING", enum: ["continue", "complete", "failed"] },
    assistantReply: { type: "STRING" },
    resultSummary: { type: "STRING" },
  },
  required: ["status", "assistantReply", "resultSummary"],
};

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
    `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" speechTimeout="auto" timeout="5" actionOnEmptyResult="true" method="POST" action="${escapeXml(actionUrl)}" language="en-US"><Play>${escapeXml(buildVoiceUrl(prompt, "call"))}</Play></Gather></Response>`,
  );
}

function cleanStringArray(value: unknown, limit = 8) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => cleanText(entry))
    .filter(Boolean)
    .slice(0, limit);
}

function readCustomerContext(payload: Record<string, unknown> | null | undefined, fallbackPhone: string | null): CustomerContext {
  const raw = typeof payload?.customerContext === "object" && payload.customerContext !== null
    ? payload.customerContext as Record<string, unknown>
    : {};

  return {
    fullName: cleanText(raw.fullName) || null,
    callbackPhone: cleanText(raw.callbackPhone, fallbackPhone ?? "") || null,
  };
}

function appendConversationEntry(
  conversationLog: Array<{ role: "agent" | "business"; text: string; at: string }>,
  role: "agent" | "business",
  text: string,
) {
  const cleaned = cleanText(text);

  if (!cleaned) {
    return;
  }

  const lastEntry = conversationLog[conversationLog.length - 1];

  if (lastEntry?.role === role && lastEntry.text === cleaned) {
    return;
  }

  conversationLog.push({
    role,
    text: cleaned,
    at: new Date().toISOString(),
  });
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

async function callGeminiDecision(
  task: {
    subject: string;
    call_goal: string;
    request_query: string;
    approved_scope: string[];
    source_snapshot: unknown;
  },
  summary: string,
  conversationLog: unknown[],
  latestSpeech: string,
  questions: string[],
  customerContext: CustomerContext,
): Promise<GeminiCallPlan> {
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
              "You are Otto, a conservative phone agent speaking to a business on behalf of a user.",
              "Decide whether to continue, complete, or fail the business call.",
              "Listen to what the business just said and answer naturally when they ask for known booking or contact details.",
              "You may only state facts that are explicitly present in approved scope, request query, task context, customer context, Firecrawl evidence, or prior business replies.",
              "Never hallucinate a booking detail, party size, date, time, email, phone number, or customer name.",
              "If the business asks for a detail you do not know, say that you do not have that detail yet and ask whether they can proceed without it or suggest a callback.",
              "If the business asks for the booking contact number and customerContext.callbackPhone exists, provide that exact number.",
              "If the business asks for the customer name and customerContext.fullName exists, provide that exact name.",
              "assistantReply must be a short spoken line for the next thing Otto should say on the call.",
              "Use status=continue when another exchange is needed, complete when the goal has been answered or the booking is done, and failed when the call is blocked or cannot proceed safely.",
            ].join("\n"),
          }],
        },
        contents: [{
          role: "user",
          parts: [{
            text: JSON.stringify({
              task: {
                subject: task.subject,
                callGoal: task.call_goal,
                requestQuery: task.request_query,
                approvedScope: task.approved_scope,
                sourceSnapshot: task.source_snapshot,
              },
              approvedSummary: summary,
              callQuestions: questions,
              customerContext,
              priorConversation: conversationLog,
              latestSpeech,
            }),
          }],
        }],
        generationConfig: {
          temperature: 0.2,
          candidateCount: 1,
          maxOutputTokens: 700,
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
  const parsed = JSON.parse(text) as GeminiCallPlan;

  return {
    status: parsed.status === "complete" || parsed.status === "failed" ? parsed.status : "continue",
    assistantReply: cleanText(parsed.assistantReply),
    resultSummary: cleanText(parsed.resultSummary),
  };
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
    const stepId = cleanText(url.searchParams.get("stepId"));

    if (!taskId || token !== OTTO_WEBHOOK_SECRET) {
      throw new HttpError(401, "Invalid webhook token.");
    }

    const { task, steps } = await fetchTaskBundle(taskId);
    const client = createServiceClient();
    const callStep = steps.find((item) => item.step_type === "call_business");
    const callbackStep = stepId
      ? steps.find((item) => item.id === stepId && item.step_type === "callback_user")
      : steps.find((item) => item.step_type === "callback_user");

    if (step === "callback") {
      if (!callbackStep) {
        throw new HttpError(404, "No callback step is associated with this task.");
      }

      const script = cleanText(callbackStep.payload?.script, "Hi, this is Otto with your update. The task has finished.");
      return xml(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${escapeXml(buildVoiceUrl(script, "callback"))}</Play><Hangup/></Response>`,
      );
    }

    if (step === "callback-status") {
      if (!callbackStep) {
        throw new HttpError(404, "No callback step is associated with this task.");
      }

      if (callbackStep.status === "completed" || callbackStep.status === "failed") {
        return new Response("ok", { headers: corsHeaders });
      }

      const form = await req.formData();
      const callStatus = cleanText(form.get("CallStatus"));

      if (callStatus === "completed") {
        await client.from("otto_task_steps").update({
          status: "completed",
          result_summary: "Callback briefing delivered.",
          completed_at: new Date().toISOString(),
        }).eq("id", callbackStep.id);
      } else if (callStatus === "busy" || callStatus === "failed" || callStatus === "no-answer") {
        await client.from("otto_task_steps").update({
          status: "failed",
          result_summary: "Could not reach you for the callback briefing.",
          completed_at: new Date().toISOString(),
        }).eq("id", callbackStep.id);
      }

      await executeTaskChain(taskId);
      return new Response("ok", { headers: corsHeaders });
    }

    if (!callStep) {
      throw new HttpError(404, "No business call step is associated with this task.");
    }

    const callPayload =
      typeof callStep.payload === "object" && callStep.payload !== null
        ? callStep.payload as Record<string, unknown>
        : {};
    const callQuestions = cleanStringArray(callPayload.questions, 6);
    const customerContext = readCustomerContext(callPayload, cleanText(task.metadata?.callbackPhone) || null);

    if (step === "intro") {
      const customerName = customerContext.fullName ? ` for ${customerContext.fullName}` : " for a customer";
      const prompt = callQuestions.length > 0
        ? `Hello, this is Otto calling${customerName}. I am calling about ${task.call_goal}. I need to confirm ${callQuestions.join(" and ")}. Can you help me with that?`
        : `Hello, this is Otto calling${customerName}. ${callStep.approval_summary ?? task.call_goal}. Can you help me with that?`;
      const conversationLog = getConversationLog(task);

      appendConversationEntry(conversationLog, "agent", prompt);

      await client.from("otto_task_steps").update({ status: "running" }).eq("id", callStep.id);
      await persistConversationLog(client, task, conversationLog, {
        status: "in_progress",
        inbox_state: "active",
        latest_step_label: callStep.title,
        latest_summary: callStep.approval_summary ?? callStep.title,
      });

      return buildGatherResponse(taskId, prompt, 1);
    }

    if (step === "status") {
      const form = await req.formData();
      const callStatus = cleanText(form.get("CallStatus"));

      if (callStep.status === "completed" || callStep.status === "failed") {
        return new Response("ok", { headers: corsHeaders });
      }

      if (callStatus === "busy" || callStatus === "failed" || callStatus === "no-answer") {
        await client.from("otto_task_steps").update({
          status: "failed",
          result_summary: "The business call could not be completed.",
          completed_at: new Date().toISOString(),
        }).eq("id", callStep.id);

        await client.from("otto_tasks").update({
          status: "in_progress",
          inbox_state: "active",
          latest_summary: "The business call could not be completed.",
          result_summary: "The business call could not be completed.",
        }).eq("id", taskId);

        await executeTaskChain(taskId);
      }

      return new Response("ok", { headers: corsHeaders });
    }

    if (step !== "gather") {
      throw new HttpError(400, "Unknown webhook step.");
    }

    const form = await req.formData();
    const latestSpeech = cleanText(form.get("SpeechResult"));
    const conversationLog = getConversationLog(task);

    if (latestSpeech) {
      appendConversationEntry(conversationLog, "business", latestSpeech);
    }

    if (!latestSpeech && turn >= 2) {
      await client.from("otto_task_steps").update({
        status: "failed",
        result_summary: "The business line did not provide a clear spoken response.",
        completed_at: new Date().toISOString(),
      }).eq("id", callStep.id);

      await client.from("otto_tasks").update({
        status: "in_progress",
        inbox_state: "active",
        latest_summary: "The business line did not provide a clear spoken response.",
        result_summary: "The business line did not provide a clear spoken response.",
      }).eq("id", taskId);

      await persistConversationLog(client, task, conversationLog);

      await executeTaskChain(taskId);
      return xml(`<?xml version="1.0" encoding="UTF-8"?><Response><Play>${escapeXml(buildVoiceUrl("No problem. I will stop here for now. Goodbye."))}</Play><Hangup/></Response>`);
    }

    if (!latestSpeech) {
      return buildGatherResponse(taskId, "I did not catch that. Could you repeat that once more?", turn + 1);
    }

    const decision = await callGeminiDecision(
      {
        subject: task.subject,
        call_goal: task.call_goal,
        request_query: task.request_query,
        approved_scope: task.approved_scope,
        source_snapshot: task.source_snapshot,
      },
      callStep.approval_summary ?? task.call_goal,
      conversationLog,
      latestSpeech,
      callQuestions,
      customerContext,
    );

    if (decision.status === "continue" && turn < MAX_CALL_TURNS && decision.assistantReply) {
      appendConversationEntry(conversationLog, "agent", decision.assistantReply);

      await persistConversationLog(client, task, conversationLog, {
        latest_summary: cleanText(decision.resultSummary, task.latest_summary ?? callStep.title),
      });

      return buildGatherResponse(taskId, decision.assistantReply, turn + 1);
    }

    const reachedTurnLimit = decision.status === "continue";
    const finalStatus = decision.status === "failed" || reachedTurnLimit ? "failed" : "completed";
    const finalSummary = cleanText(
      decision.resultSummary,
      finalStatus === "completed"
        ? "The business call completed successfully."
        : reachedTurnLimit
          ? "The business call reached Otto's safe turn limit before a clear outcome was confirmed."
          : "The business call stopped without a clear outcome.",
    );
    const closingReply = reachedTurnLimit
      ? "Thank you. I need to stop here and follow up another way. Goodbye."
      : cleanText(decision.assistantReply, "Thank you. That is all I needed today. Goodbye.");

    await client.from("otto_task_steps").update({
      status: finalStatus,
      result_summary: finalSummary,
      completed_at: new Date().toISOString(),
    }).eq("id", callStep.id);

    await client.from("otto_tasks").update({
      status: "in_progress",
      inbox_state: "active",
      latest_summary: finalSummary,
      result_summary: finalSummary,
    }).eq("id", taskId);

    await persistConversationLog(client, task, conversationLog);

    await executeTaskChain(taskId);

    return xml(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${escapeXml(buildVoiceUrl(closingReply))}</Play><Hangup/></Response>`,
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
