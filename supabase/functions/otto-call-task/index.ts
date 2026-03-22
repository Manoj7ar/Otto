import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  authenticateUser,
  assertCallRuntimeReady,
  cleanStringArray,
  cleanText,
  createApprovedRecord,
  createServiceClient,
  executeTaskChain,
  fetchUserProfileById,
  HttpError,
  normalizeCallProposal,
} from "../_shared/otto-concierge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-otto-auth, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CreateTaskRequest {
  query?: string;
  subject?: string;
  callProposal?: unknown;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const user = await authenticateUser(req);
    assertCallRuntimeReady();
    const profile = await fetchUserProfileById(user.id);
    const { query = "", subject = "", callProposal }: CreateTaskRequest = await req.json();
    const proposal = normalizeCallProposal(callProposal);

    if (!proposal) {
      throw new HttpError(400, "A valid call proposal is required.");
    }

    if (!profile.callback_phone) {
      throw new HttpError(400, "Add a callback phone number in your profile before starting cloud calls.");
    }

    const serviceClient = createServiceClient();
    const customerContext = {
      fullName: cleanText(profile.full_name) || null,
      callbackPhone: profile.callback_phone,
    };
    const approvedScope = cleanStringArray(
      [
        proposal.callReason,
        ...proposal.callQuestions,
        "Call the user back with the result.",
      ],
      12,
    );
    const { data: task, error: insertError } = await serviceClient
      .from("otto_tasks")
      .insert({
        user_id: user.id,
        status: "queued",
        task_type: proposal.callType,
        title: proposal.title,
        subject: cleanText(subject, proposal.callTargetName),
        business_name: proposal.callTargetName,
        business_phone: proposal.callTargetPhone,
        business_website: proposal.firecrawlEvidence[0]?.url ?? null,
        call_goal: proposal.callReason,
        approval_summary: proposal.summary,
        approved_scope: approvedScope,
        request_query: cleanText(query, proposal.summary),
        source_snapshot: proposal.firecrawlEvidence,
        conversation_log: [],
        metadata: {
          callQuestions: proposal.callQuestions,
          callReason: proposal.callReason,
          followUpActions: ["callback_user"],
          callbackPhone: profile.callback_phone,
          callBriefingEnabled: true,
          callTargetEmail: proposal.callTargetEmail,
          customerContext,
          conversationLog: [],
        },
        inbox_state: "active",
        latest_summary: proposal.summary,
        latest_step_label: "Calling the business",
      })
      .select("id")
      .single();

    if (insertError || !task) {
      throw new HttpError(500, "Could not create the cloud call task.");
    }

    const steps = [
      {
        task_id: task.id,
        user_id: user.id,
        step_order: 0,
        step_type: "call_business",
        title: `Call ${proposal.callTargetName}`,
        status: "approved",
        approval_required: true,
        approval_summary: proposal.summary,
        recipient_name: proposal.callTargetName,
        recipient_phone: proposal.callTargetPhone,
        payload: {
          callReason: proposal.callReason,
          questions: proposal.callQuestions,
          firecrawlEvidence: proposal.firecrawlEvidence,
          requestQuery: cleanText(query, proposal.summary),
          subject: cleanText(subject, proposal.callTargetName),
          approvedScope,
          customerContext,
        },
      },
      {
        task_id: task.id,
        user_id: user.id,
        step_order: 1,
        step_type: "callback_user",
        title: "Call you back with the result",
        status: "pending",
        approval_required: false,
        approval_summary: "Place a callback briefing after the task finishes.",
        recipient_name: profile.full_name,
        recipient_phone: profile.callback_phone,
        payload: {},
      },
    ];

    const { data: insertedSteps, error: stepError } = await serviceClient
      .from("otto_task_steps")
      .insert(steps)
      .select("id, step_order, title");

    if (stepError || !insertedSteps || insertedSteps.length === 0) {
      throw new HttpError(500, "Could not create the call task steps.");
    }

    const firstInsertedStep = insertedSteps.find((step) => step.step_order === 0) ?? insertedSteps[0];

    if (firstInsertedStep) {
      await createApprovedRecord(task.id, firstInsertedStep.id, user.id, proposal.summary);
    }

    await executeTaskChain(task.id);

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
