import { Clock3, ExternalLink, Mail, Phone, RefreshCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { resolveTaskApproval } from "../api/resolveTaskApproval";
import type { InboxTask } from "../types";

interface TaskHistoryPanelProps {
  tasks: InboxTask[];
  busy?: boolean;
  onRefresh: () => Promise<void> | void;
}

const stateLabel: Record<InboxTask["inbox_state"], string> = {
  active: "Active",
  waiting_approval: "Waiting approval",
  completed: "Completed",
  failed: "Failed",
  canceled: "Canceled",
};

function formatDate(timestamp: string | null) {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function readCallQuestions(task: InboxTask) {
  const raw = task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
    ? (task.metadata as Record<string, unknown>).callQuestions
    : null;

  return Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : [];
}

function readSourceSnapshot(task: InboxTask) {
  const raw = Array.isArray(task.source_snapshot) ? task.source_snapshot : [];

  return raw
    .map((entry) => {
      const row = typeof entry === "object" && entry !== null ? entry as Record<string, unknown> : {};
      const title = typeof row.title === "string" ? row.title : "";
      const url = typeof row.url === "string" ? row.url : "";

      if (!title || !url) {
        return null;
      }

      return {
        title,
        url,
        snippet: typeof row.snippet === "string" ? row.snippet : "",
      };
    })
    .filter((entry): entry is { title: string; url: string; snippet: string } => Boolean(entry));
}

function stepIcon(stepType: InboxTask["steps"][number]["step_type"]) {
  if (stepType === "call_business" || stepType === "callback_user") {
    return <Phone size={14} />;
  }

  return <Mail size={14} />;
}

export default function TaskHistoryPanel({ tasks, busy = false, onRefresh }: TaskHistoryPanelProps) {
  const activeTasks = tasks.filter((task) => task.inbox_state === "active" || task.inbox_state === "waiting_approval");
  const finishedTasks = tasks.filter((task) => !activeTasks.includes(task));

  const handleResolve = async (taskId: string, approvalId: string, decision: "approved" | "declined") => {
    try {
      await resolveTaskApproval(taskId, approvalId, decision);
      toast.success(decision === "approved" ? "Action approved." : "Action declined.");
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the approval.");
    }
  };

  const sections = [
    { title: "Active jobs", items: activeTasks },
    { title: "Finished jobs", items: finishedTasks },
  ].filter((section) => section.items.length > 0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-32 pt-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-secondary-otto">Cloud calls</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Active call jobs and callbacks</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-secondary-otto">
            Otto stores Firecrawl evidence, business call progress, callback briefings, and any optional follow-up emails here.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="glass-button inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm"
        >
          <RefreshCcw size={16} className={busy ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="glass-strong rounded-[2rem] p-8 text-sm leading-7 text-secondary-otto">
          No cloud call jobs yet. Ask Otto a question that may need a live call, then approve the proposal to start a cloud-run workflow.
        </div>
      ) : (
        sections.map((section) => (
          <section key={section.title} className="space-y-4">
            <h2 className="text-sm uppercase tracking-[0.24em] text-secondary-otto">{section.title}</h2>

            {section.items.map((task) => {
              const pendingApprovals = task.approvals.filter((approval) => approval.status === "pending");
              const firecrawlEvidence = readSourceSnapshot(task);
              const callQuestions = readCallQuestions(task);

              return (
                <article key={task.id} className="glass-strong rounded-[2rem] p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm uppercase tracking-[0.22em] text-secondary-otto">{task.task_type}</p>
                      <h3 className="mt-2 text-xl font-semibold">{task.title || task.business_name}</h3>
                      <p className="mt-2 text-sm text-foreground/80">{task.latest_summary || task.call_goal}</p>
                    </div>
                    <div className="glass rounded-full px-3 py-2 text-xs uppercase tracking-[0.2em] text-secondary-otto">
                      {stateLabel[task.inbox_state]}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="glass-panel rounded-3xl p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Current step</p>
                      <p className="mt-2 text-sm text-foreground/90">{task.latest_step_label || "Awaiting work"}</p>
                    </div>
                    <div className="glass-panel rounded-3xl p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Updated</p>
                      <p className="mt-2 text-sm text-foreground/90">{formatDate(task.updated_at)}</p>
                    </div>
                    <div className="glass-panel rounded-3xl p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Business target</p>
                      <p className="mt-2 text-sm text-foreground/90">{task.business_name}</p>
                    </div>
                  </div>

                  {callQuestions.length > 0 && (
                    <div className="mt-5 glass rounded-3xl p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-secondary-otto">What Otto asked</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {callQuestions.map((question) => (
                          <span key={question} className="rounded-full border border-white/8 bg-black/10 px-3 py-2 text-xs text-secondary-otto">
                            {question}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {firecrawlEvidence.length > 0 && (
                    <div className="mt-5 space-y-3">
                      {firecrawlEvidence.map((source) => (
                        <a
                          key={source.url}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="glass rounded-3xl block p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">{source.title}</p>
                              {source.snippet && <p className="mt-1 text-sm leading-6 text-foreground/75">{source.snippet}</p>}
                            </div>
                            <ExternalLink size={14} className="mt-1 shrink-0 text-primary" />
                          </div>
                        </a>
                      ))}
                    </div>
                  )}

                  {pendingApprovals.length > 0 && (
                    <div className="mt-5 space-y-3">
                      {pendingApprovals.map((approval) => (
                        <div key={approval.id} className="glass rounded-3xl p-4">
                          <div className="flex items-start gap-3">
                            <ShieldCheck size={16} className="mt-1 shrink-0 text-primary" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-foreground">Approval needed</p>
                              <p className="mt-1 text-sm leading-6 text-foreground/80">{approval.summary}</p>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() => void handleResolve(task.id, approval.id, "approved")}
                              className="glass-button-primary rounded-full px-5 py-3 text-sm font-medium"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleResolve(task.id, approval.id, "declined")}
                              className="glass-button rounded-full px-5 py-3 text-sm font-medium"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-5 grid gap-3">
                    {task.steps.map((step) => (
                      <div key={step.id} className="glass-panel rounded-3xl p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 text-primary">{stepIcon(step.step_type)}</div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{step.title}</p>
                              <p className="mt-1 text-sm leading-6 text-foreground/75">{step.approval_summary || step.result_summary || "Pending"}</p>
                            </div>
                          </div>
                          <div className="text-[11px] uppercase tracking-[0.18em] text-secondary-otto">
                            {step.status}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {task.emails.length > 0 && (
                    <div className="mt-5 space-y-3">
                      {task.emails.map((email) => (
                        <div key={email.id} className="glass rounded-3xl p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">{email.subject}</p>
                              <p className="mt-1 text-sm text-secondary-otto">{email.recipient_email}</p>
                            </div>
                            <div className="text-[11px] uppercase tracking-[0.18em] text-secondary-otto">
                              {email.status}
                            </div>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-foreground/80">{email.body}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap gap-3 text-sm text-secondary-otto">
                    <span className="inline-flex items-center gap-2">
                      <Clock3 size={14} />
                      {task.completed_at ? `Finished ${formatDate(task.completed_at)}` : "Still running"}
                    </span>
                  </div>
                </article>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}
