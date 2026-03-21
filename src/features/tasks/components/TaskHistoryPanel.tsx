import { Clock3, Phone, PhoneCall, RefreshCcw } from "lucide-react";
import type { Database } from "@/shared/supabase/types";

type OttoTaskRow = Database["public"]["Tables"]["otto_tasks"]["Row"];

interface TaskHistoryPanelProps {
  tasks: OttoTaskRow[];
  busy?: boolean;
  onRefresh: () => Promise<void> | void;
}

const statusLabel: Record<OttoTaskRow["status"], string> = {
  queued: "Queued",
  dialing: "Dialing",
  in_progress: "In progress",
  completed: "Completed",
  failed: "Failed",
  canceled: "Canceled",
};

function formatDate(timestamp: string) {
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

export default function TaskHistoryPanel({ tasks, busy = false, onRefresh }: TaskHistoryPanelProps) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-32 pt-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-secondary-otto">Cloud tasks</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Verification and booking runs</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-secondary-otto">
            Otto stores every approved call workflow here so you can track cloud activity, callbacks, and final results.
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
          No cloud tasks yet. Ask Otto to call a business to verify details or make a booking, then approve the plan.
        </div>
      ) : (
        <div className="grid gap-4">
          {tasks.map((task) => (
            <article key={task.id} className="glass-strong rounded-[2rem] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.22em] text-secondary-otto">{task.task_type}</p>
                  <h2 className="mt-2 text-xl font-semibold">{task.business_name}</h2>
                  <p className="mt-2 text-sm text-foreground/80">{task.call_goal}</p>
                </div>
                <div className="glass rounded-full px-3 py-2 text-xs uppercase tracking-[0.2em] text-secondary-otto">
                  {statusLabel[task.status]}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="glass-panel rounded-3xl p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Subject</p>
                  <p className="mt-2 text-sm text-foreground/90">{task.subject}</p>
                </div>
                <div className="glass-panel rounded-3xl p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Business phone</p>
                  <p className="mt-2 text-sm text-foreground/90">{task.business_phone || "Not available"}</p>
                </div>
                <div className="glass-panel rounded-3xl p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Created</p>
                  <p className="mt-2 text-sm text-foreground/90">{formatDate(task.created_at)}</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3 text-sm text-secondary-otto">
                <span className="inline-flex items-center gap-2">
                  <Phone size={14} />
                  {task.approval_summary}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Clock3 size={14} />
                  {task.completed_at ? `Finished ${formatDate(task.completed_at)}` : "Awaiting completion"}
                </span>
                {task.callback_call_sid && (
                  <span className="inline-flex items-center gap-2">
                    <PhoneCall size={14} />
                    Callback briefing sent
                  </span>
                )}
              </div>

              {task.result_summary && (
                <div className="glass mt-5 rounded-3xl p-4 text-sm leading-7 text-foreground/90">
                  {task.result_summary}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
