import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateUser, HttpError, resolveApproval } from "../_shared/otto-concierge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ApprovalRequest {
  taskId?: string;
  approvalId?: string;
  decision?: "approved" | "declined";
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
    const { taskId = "", approvalId = "", decision }: ApprovalRequest = await req.json();

    if (!taskId || !approvalId || (decision !== "approved" && decision !== "declined")) {
      throw new HttpError(400, "taskId, approvalId, and a valid decision are required.");
    }

    await resolveApproval(taskId, approvalId, user.id, decision);

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("otto_task_approval_error", error);

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }

    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
