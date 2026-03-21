import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Mail, Phone, ShieldCheck, X } from "lucide-react";
import type { OttoCallProposal } from "../types";

interface CallApprovalSheetProps {
  proposal: OttoCallProposal | null;
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
                <p className="text-sm uppercase tracking-[0.24em] text-secondary-otto">Call approval</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">Do you want me to make this call?</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-secondary-otto">{proposal.summary}</p>
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
                <p className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Why Otto wants to call</p>
                <p className="mt-2 text-base font-medium">{proposal.title}</p>
                <p className="mt-1 text-sm text-secondary-otto">{proposal.callReason}</p>
              </div>

              <div className="glass-panel rounded-3xl p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Call target</p>
                <p className="mt-2 text-sm leading-7 text-foreground/90">
                  {proposal.callTargetName}
                </p>
                <p className="mt-1 text-sm text-secondary-otto">
                  {[proposal.callTargetPhone, proposal.callTargetEmail].filter(Boolean).join(" | ")}
                </p>
              </div>

              <div className="glass-panel rounded-3xl p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-secondary-otto">What Otto will ask</p>
                <div className="mt-3 space-y-2">
                  {proposal.callQuestions.map((question) => (
                    <div key={question} className="rounded-2xl border border-white/8 bg-black/10 px-4 py-3 text-sm leading-6 text-foreground/85">
                      {question}
                    </div>
                  ))}
                </div>
              </div>

              {proposal.firecrawlEvidence.length > 0 && (
                <div className="glass-panel rounded-3xl p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Firecrawl evidence</p>
                  <div className="mt-3 space-y-3">
                    {proposal.firecrawlEvidence.map((source) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-2xl border border-white/8 bg-black/10 px-4 py-3 transition-transform duration-200 hover:-translate-y-0.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{source.title}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-secondary-otto">{source.sourceType}</p>
                          </div>
                          <ExternalLink size={14} className="mt-1 shrink-0 text-primary" />
                        </div>
                        {source.snippet && <p className="mt-3 text-sm leading-6 text-foreground/75">{source.snippet}</p>}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="glass-panel rounded-3xl p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-secondary-otto">After the call</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {proposal.followUpActions.map((action) => (
                    <span key={action} className="rounded-full border border-white/8 bg-black/10 px-3 py-2 text-xs text-secondary-otto">
                      {action === "callback_user" ? "Call me back with the result" : "Send me an email update"}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="glass mt-5 flex items-start gap-3 rounded-3xl p-4 text-sm leading-6 text-foreground/85">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
              Once you approve, the entire workflow runs in the cloud. You can close the app and Otto will continue the call, follow-up actions, and callback briefing.
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onApprove()}
                className="glass-button-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium disabled:opacity-50"
              >
                <Phone size={16} />
                {busy ? "Starting call..." : "Yes, make the call"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="glass-button inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium"
              >
                <Mail size={16} />
                Not now
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
