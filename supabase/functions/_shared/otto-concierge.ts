import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

export type FollowUpAction = "callback_user";
export type ProposedStepType = "call_business" | "callback_user";

export interface FirecrawlEvidence {
  title: string;
  url: string;
  snippet: string;
  sourceType: string;
}

export interface CallProposal {
  callType: "verification" | "booking";
  title: string;
  summary: string;
  callReason: string;
  callTargetName: string;
  callTargetPhone: string;
  callTargetEmail: string | null;
  firecrawlEvidence: FirecrawlEvidence[];
  callQuestions: string[];
  followUpActions: FollowUpAction[];
}

export interface ConciergeTaskRow {
  id: string;
  user_id: string;
  task_type: "verification" | "booking" | "concierge";
  title: string;
  subject: string;
  business_name: string;
  business_phone: string | null;
  business_website: string | null;
  call_goal: string;
  approval_summary: string;
  approved_scope: string[];
  request_query: string;
  status: "queued" | "dialing" | "in_progress" | "completed" | "failed" | "canceled";
  inbox_state: "active" | "waiting_approval" | "completed" | "failed" | "canceled";
  latest_step_label: string | null;
  latest_summary: string | null;
  metadata: Record<string, unknown>;
  conversation_log: unknown[];
  callback_call_sid: string | null;
  twilio_call_sid: string | null;
  result_summary: string | null;
}

export interface ConciergeStepRow {
  id: string;
  task_id: string;
  user_id: string;
  step_order: number;
  step_type: ProposedStepType;
  title: string;
  status: "pending" | "waiting_approval" | "approved" | "declined" | "running" | "completed" | "failed" | "skipped";
  approval_required: boolean;
  approval_summary: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  payload: Record<string, unknown>;
  result_summary: string | null;
}

interface UserProfileRow {
  full_name: string | null;
  callback_phone: string | null;
  call_briefing_enabled: boolean;
}

interface ConversationEntry {
  role: "agent" | "business";
  text: string;
  at: string;
}

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
const ELEVENLABS_CALL_VOICE_ID = Deno.env.get("ELEVENLABS_CALL_VOICE_ID") ?? Deno.env.get("ELEVENLABS_APP_VOICE_ID") ?? "";
const ELEVENLABS_CALLBACK_VOICE_ID = Deno.env.get("ELEVENLABS_CALLBACK_VOICE_ID") ?? Deno.env.get("ELEVENLABS_APP_VOICE_ID") ?? "";
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER") ?? "";
const OTTO_WEBHOOK_SECRET = Deno.env.get("OTTO_WEBHOOK_SECRET") ?? "";

export function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function cleanStringArray(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const normalized = value.replace(/[^\d+]/g, "");
  return normalized.length >= 7 ? normalized : null;
}

export function createServiceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(500, "Supabase service role is not configured.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export function assertCallRuntimeReady() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(500, "Supabase service role is not configured.");
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER || !OTTO_WEBHOOK_SECRET) {
    throw new HttpError(500, "Twilio is not fully configured for cloud calls.");
  }

  if (!ELEVENLABS_API_KEY || !ELEVENLABS_CALL_VOICE_ID || !ELEVENLABS_CALLBACK_VOICE_ID) {
    throw new HttpError(500, "ElevenLabs is not fully configured for call and callback voice.");
  }
}

export async function authenticateUser(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new HttpError(500, "Supabase environment is not configured.");
  }

  const authHeader = req.headers.get("x-otto-auth") ?? req.headers.get("Authorization");

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

export function normalizeCallProposal(raw: unknown): CallProposal | null {
  const data = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : null;

  if (!data) {
    return null;
  }

  const callType = data.callType === "verification" || data.callType === "booking" ? data.callType : null;
  const callTargetPhone = normalizePhone(data.callTargetPhone);
  const firecrawlEvidence = Array.isArray(data.firecrawlEvidence)
    ? data.firecrawlEvidence
      .map((entry) => {
        const row = typeof entry === "object" && entry !== null ? entry as Record<string, unknown> : {};
        const title = cleanText(row.title);
        const url = cleanText(row.url);

        if (!title || !url) {
          return null;
        }

        return {
          title,
          url,
          snippet: cleanText(row.snippet),
          sourceType: cleanText(row.sourceType, "web"),
        } satisfies FirecrawlEvidence;
      })
      .filter((entry): entry is FirecrawlEvidence => Boolean(entry))
      .slice(0, 4)
    : [];

  if (!callType || !callTargetPhone) {
    return null;
  }

  const title = cleanText(data.title);
  const summary = cleanText(data.summary);
  const callReason = cleanText(data.callReason);
  const callTargetName = cleanText(data.callTargetName);

  if (!title || !summary || !callReason || !callTargetName) {
    return null;
  }

  return {
    callType,
    title,
    summary,
    callReason,
    callTargetName,
    callTargetPhone,
    callTargetEmail: cleanText(data.callTargetEmail) || null,
    firecrawlEvidence,
    callQuestions: cleanStringArray(data.callQuestions, 6),
    followUpActions: ["callback_user"],
  };
}

export async function fetchUserProfileById(userId: string): Promise<UserProfileRow> {
  const client = createServiceClient();
  const { data, error } = await client
    .from("profiles")
    .select("full_name, callback_phone, call_briefing_enabled")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new HttpError(404, "Profile not found.");
  }

  return data as UserProfileRow;
}

export async function fetchTaskBundle(taskId: string) {
  const client = createServiceClient();
  const { data: task, error: taskError } = await client.from("otto_tasks").select("*").eq("id", taskId).maybeSingle();

  if (taskError || !task) {
    throw new HttpError(404, "Task not found.");
  }

  const { data: steps, error: stepError } = await client
    .from("otto_task_steps")
    .select("*")
    .eq("task_id", taskId)
    .order("step_order", { ascending: true });

  if (stepError) {
    throw new HttpError(500, "Could not load task steps.");
  }

  return {
    client,
    task: task as ConciergeTaskRow,
    steps: (steps ?? []) as ConciergeStepRow[],
  };
}

export async function createApprovedRecord(taskId: string, stepId: string, userId: string, summary: string) {
  const client = createServiceClient();
  await client.from("otto_task_approvals").insert({
    task_id: taskId,
    step_id: stepId,
    user_id: userId,
    status: "approved",
    summary,
    resolved_at: new Date().toISOString(),
  });
}

async function ensurePendingApproval(task: ConciergeTaskRow, step: ConciergeStepRow) {
  const client = createServiceClient();
  const { data: existing } = await client
    .from("otto_task_approvals")
    .select("id")
    .eq("task_id", task.id)
    .eq("step_id", step.id)
    .eq("status", "pending")
    .maybeSingle();

  if (!existing) {
    await client.from("otto_task_approvals").insert({
      task_id: task.id,
      step_id: step.id,
      user_id: task.user_id,
      status: "pending",
      summary: step.approval_summary ?? step.title,
    });
  }

  await client.from("otto_task_steps").update({ status: "waiting_approval" }).eq("id", step.id);
  await client.from("otto_tasks").update({
    inbox_state: "waiting_approval",
    latest_step_label: step.title,
    latest_summary: step.approval_summary ?? step.title,
    status: "queued",
  }).eq("id", task.id);
}

function getCallStep(steps: ConciergeStepRow[]) {
  return steps.find((step) => step.step_type === "call_business") ?? null;
}

function getCallbackStep(steps: ConciergeStepRow[]) {
  return steps.find((step) => step.step_type === "callback_user") ?? null;
}

function buildOutcomeSummary(task: ConciergeTaskRow, steps: ConciergeStepRow[]) {
  const callStep = getCallStep(steps);
  const callbackStep = getCallbackStep(steps);
  const parts = [
    cleanText(
      callStep?.result_summary,
      cleanText(task.result_summary, cleanText(task.latest_summary, task.call_goal)),
    ),
  ];

  if (callbackStep?.status === "completed") {
    parts.push("Callback delivered.");
  } else if (callbackStep?.status === "failed") {
    parts.push("Callback did not connect.");
  }

  return parts.filter(Boolean).join(" ").trim();
}

function buildCallbackScript(task: ConciergeTaskRow, steps: ConciergeStepRow[]) {
  const summary = buildOutcomeSummary(task, steps);
  return [
    `Hi, this is Otto with your update about ${task.business_name || task.subject}.`,
    summary || "The task has finished.",
    "You can check the app for the full Firecrawl evidence and call timeline.",
  ].join(" ");
}

export function getConversationLog(task: ConciergeTaskRow): ConversationEntry[] {
  const fromColumn = Array.isArray(task.conversation_log) ? task.conversation_log : [];
  const fromMetadata =
    Array.isArray(task.metadata?.conversationLog) ? task.metadata.conversationLog : [];

  return (fromColumn.length > 0 ? fromColumn : fromMetadata)
    .map((entry) => {
      const row = typeof entry === "object" && entry !== null ? entry as Record<string, unknown> : {};
      const role = row.role === "agent" || row.role === "business" ? row.role : null;
      const text = cleanText(row.text);
      const at = cleanText(row.at, new Date().toISOString());

      if (!role || !text) {
        return null;
      }

      return { role, text, at } satisfies ConversationEntry;
    })
    .filter((entry): entry is ConversationEntry => Boolean(entry));
}

export async function persistConversationLog(
  client: ReturnType<typeof createServiceClient>,
  task: ConciergeTaskRow,
  conversationLog: ConversationEntry[],
  updates: Record<string, unknown> = {},
) {
  await client.from("otto_tasks").update({
    ...updates,
    conversation_log: conversationLog,
    metadata: {
      ...task.metadata,
      conversationLog,
    },
  }).eq("id", task.id);
}

async function createTwilioCall(params: URLSearchParams) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER || !OTTO_WEBHOOK_SECRET) {
    throw new HttpError(500, "Twilio call environment is not configured.");
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    console.error("twilio_call_create_error", await response.text());
    throw new HttpError(502, "Twilio could not start the call.");
  }

  return await response.json();
}

async function createBusinessCall(task: ConciergeTaskRow, step: ConciergeStepRow) {
  const phone = step.recipient_phone || task.business_phone;

  if (!phone) {
    throw new HttpError(400, "Business phone number is missing.");
  }

  const webhookBase = `${SUPABASE_URL}/functions/v1/otto-call-webhook`;
  const params = new URLSearchParams({
    Url: `${webhookBase}?taskId=${encodeURIComponent(task.id)}&token=${encodeURIComponent(OTTO_WEBHOOK_SECRET)}&step=intro`,
    StatusCallback: `${webhookBase}?taskId=${encodeURIComponent(task.id)}&token=${encodeURIComponent(OTTO_WEBHOOK_SECRET)}&step=status`,
    StatusCallbackMethod: "POST",
    From: TWILIO_PHONE_NUMBER,
    To: phone,
    Record: "true",
  });
  params.append("StatusCallbackEvent", "initiated");
  params.append("StatusCallbackEvent", "ringing");
  params.append("StatusCallbackEvent", "answered");
  params.append("StatusCallbackEvent", "completed");

  const call = await createTwilioCall(params);
  const client = createServiceClient();
  await client.from("otto_task_steps").update({ status: "running" }).eq("id", step.id);
  await client.from("otto_tasks").update({
    status: "dialing",
    inbox_state: "active",
    latest_step_label: step.title,
    latest_summary: step.approval_summary ?? step.title,
    twilio_call_sid: cleanText(call.sid),
  }).eq("id", task.id);
}

async function createCallbackCall(task: ConciergeTaskRow, step: ConciergeStepRow, steps: ConciergeStepRow[]) {
  const phone = step.recipient_phone || normalizePhone(task.metadata?.callbackPhone);

  if (!phone) {
    throw new HttpError(400, "User callback phone number is missing.");
  }

  const client = createServiceClient();
  const script = buildCallbackScript(task, steps);
  const webhookBase = `${SUPABASE_URL}/functions/v1/otto-call-webhook`;
  const params = new URLSearchParams({
    Url: `${webhookBase}?taskId=${encodeURIComponent(task.id)}&token=${encodeURIComponent(OTTO_WEBHOOK_SECRET)}&step=callback&stepId=${encodeURIComponent(step.id)}`,
    StatusCallback: `${webhookBase}?taskId=${encodeURIComponent(task.id)}&token=${encodeURIComponent(OTTO_WEBHOOK_SECRET)}&step=callback-status&stepId=${encodeURIComponent(step.id)}`,
    StatusCallbackMethod: "POST",
    From: TWILIO_PHONE_NUMBER,
    To: phone,
  });
  params.append("StatusCallbackEvent", "initiated");
  params.append("StatusCallbackEvent", "ringing");
  params.append("StatusCallbackEvent", "answered");
  params.append("StatusCallbackEvent", "completed");

  await client.from("otto_task_steps").update({
    payload: {
      ...step.payload,
      script,
    },
  }).eq("id", step.id);

  const call = await createTwilioCall(params);
  await client.from("otto_task_steps").update({ status: "running" }).eq("id", step.id);
  await client.from("otto_tasks").update({
    status: "in_progress",
    inbox_state: "active",
    latest_step_label: step.title,
    latest_summary: "Calling you back with the result.",
    callback_call_sid: cleanText(call.sid),
  }).eq("id", task.id);
}

function deriveFinalTaskStatus(task: ConciergeTaskRow, steps: ConciergeStepRow[]) {
  const callStep = getCallStep(steps);

  if (!callStep) {
    return {
      status: "failed" as const,
      inboxState: "failed" as const,
    };
  }

  if (callStep.status === "declined") {
    return {
      status: "canceled" as const,
      inboxState: "canceled" as const,
    };
  }

  if (callStep.status === "failed") {
    return {
      status: "failed" as const,
      inboxState: "failed" as const,
    };
  }

  if (callStep.status === "completed") {
    return {
      status: "completed" as const,
      inboxState: "completed" as const,
    };
  }

  return {
    status: task.status === "canceled" ? "canceled" as const : "failed" as const,
    inboxState: task.inbox_state === "canceled" ? "canceled" as const : "failed" as const,
  };
}

export async function executeTaskChain(taskId: string) {
  let bundle = await fetchTaskBundle(taskId);

  for (const step of bundle.steps) {
    if (step.status === "completed" || step.status === "skipped" || step.status === "declined" || step.status === "failed") {
      continue;
    }

    if (step.status === "waiting_approval" || step.status === "running") {
      return;
    }

    if (step.approval_required && step.status !== "approved") {
      await ensurePendingApproval(bundle.task, step);
      return;
    }

    try {
      await bundle.client.from("otto_task_steps").update({ status: "running" }).eq("id", step.id);
      await bundle.client.from("otto_tasks").update({
        status: "in_progress",
        inbox_state: "active",
        latest_step_label: step.title,
        latest_summary: step.approval_summary ?? step.title,
      }).eq("id", bundle.task.id);

      if (step.step_type === "call_business") {
        await createBusinessCall(bundle.task, step);
        return;
      }

      await createCallbackCall(bundle.task, step, bundle.steps);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown step failure";

      await bundle.client.from("otto_task_steps").update({
        status: "failed",
        result_summary: message,
        completed_at: new Date().toISOString(),
      }).eq("id", step.id);

      await bundle.client.from("otto_tasks").update({
        status: "in_progress",
        inbox_state: "active",
        latest_step_label: step.title,
        latest_summary: message,
        result_summary: message,
      }).eq("id", bundle.task.id);

      bundle = await fetchTaskBundle(taskId);
    }
  }

  const finalBundle = await fetchTaskBundle(taskId);
  const finalState = deriveFinalTaskStatus(finalBundle.task, finalBundle.steps);
  const finalSummary = buildOutcomeSummary(finalBundle.task, finalBundle.steps);

  await finalBundle.client.from("otto_tasks").update({
    status: finalState.status,
    inbox_state: finalState.inboxState,
    latest_summary: cleanText(finalSummary, finalBundle.task.latest_summary ?? finalBundle.task.call_goal),
    result_summary: cleanText(finalSummary, finalBundle.task.result_summary ?? finalBundle.task.call_goal),
    completed_at: new Date().toISOString(),
  }).eq("id", taskId);
}

export async function resolveApproval(taskId: string, approvalId: string, userId: string, decision: "approved" | "declined") {
  const client = createServiceClient();
  const { data: approval, error } = await client
    .from("otto_task_approvals")
    .select("*")
    .eq("id", approvalId)
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !approval) {
    throw new HttpError(404, "Approval not found.");
  }

  if (approval.status !== "pending") {
    return;
  }

  await client.from("otto_task_approvals").update({
    status: decision,
    resolved_at: new Date().toISOString(),
  }).eq("id", approvalId);

  if (decision === "declined") {
    await client.from("otto_task_steps").update({
      status: "declined",
      result_summary: "The user declined this action.",
    }).eq("id", approval.step_id);

    await client.from("otto_tasks").update({
      status: "canceled",
      inbox_state: "canceled",
      latest_summary: "The user declined the pending action.",
      result_summary: "The user declined the pending action.",
      completed_at: new Date().toISOString(),
    }).eq("id", taskId);
    return;
  }

  await client.from("otto_task_steps").update({ status: "approved" }).eq("id", approval.step_id);
  await executeTaskChain(taskId);
}
