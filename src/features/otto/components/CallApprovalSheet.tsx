import { AnimatePresence, motion } from "framer-motion";
import { Phone, ShieldCheck, X } from "lucide-react";
import type { OttoProposedTask } from "../types";

interface CallApprovalSheetProps {
  proposal: OttoProposedTask | null;
  visible: boolean;
  busy?: boolean;
  onApprove: () => Promise<void> | void;
  onClose: () => void;
}

export default function CallApprovalSheet({
  proposal,
  visible,
  busy = false,
  onApprove,
  onClose,
}: CallApprovalSheetProps) {
  if (!proposal) {
    return null;
  }

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="glass-strong fixed inset-x-0 bottom-0 z-[60] mx-auto max-w-xl rounded-t-[2rem] px-5 pb-8 pt-5"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-white/15" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-secondary-otto">Approval required</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">Let Otto place the cloud call?</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="glass flex h-10 w-10 items-center justify-center rounded-full"
                aria-label="Close approval"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              <div className="glass-panel rounded-3xl p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Business</p>
                <p className="mt-2 text-base font-medium">{proposal.businessName}</p>
                <p className="mt-1 text-sm text-secondary-otto">{proposal.businessPhone || "Phone number not verified yet"}</p>
              </div>
              <div className="glass-panel rounded-3xl p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Goal</p>
                <p className="mt-2 text-sm leading-7 text-foreground/90">{proposal.callGoal}</p>
              </div>
              <div className="glass-panel rounded-3xl p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Approved scope</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {proposal.approvedScope.map((item) => (
                    <span key={item} className="glass rounded-full px-3 py-2 text-xs text-secondary-otto">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="glass-panel rounded-3xl p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Call plan</p>
                <p className="mt-2 text-sm leading-7 text-foreground/90">{proposal.approvalSummary}</p>
                {proposal.questions.length > 0 && (
                  <ul className="mt-3 space-y-2 text-sm text-secondary-otto">
                    {proposal.questions.map((question) => (
                      <li key={question}>• {question}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="glass mt-5 flex items-start gap-3 rounded-3xl p-4 text-sm leading-6 text-foreground/85">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
              Otto will only call within the approved scope. If the business asks for information outside it, the workflow will stop instead of improvising.
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => void onApprove()}
              className="glass-button-primary mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium disabled:opacity-50"
            >
              <Phone size={16} />
              {busy ? "Starting task..." : "Approve and start call task"}
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
