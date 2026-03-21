import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Eye, Globe, Mic2, MicOff, Phone, RotateCcw, Sparkles, Volume2, X } from "lucide-react";
import SourceCard from "./SourceCard";
import type { OttoReplyData, OttoSessionContext } from "../types";

interface SessionDrawerProps {
  visible: boolean;
  onClose: () => void;
  onResetSession: () => void;
  latestReply: OttoReplyData | null;
  sessionContext: OttoSessionContext;
  canSpeak: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  onReplay: () => void;
  onToggleMute: () => void;
  onReviewTaskProposal: () => void;
}

const confidenceLabel: Record<OttoReplyData["confidence"], string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

function formatTime(timestamp: string) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SessionDrawer({
  visible,
  onClose,
  onResetSession,
  latestReply,
  sessionContext,
  canSpeak,
  isMuted,
  isSpeaking,
  onReplay,
  onToggleMute,
  onReviewTaskProposal,
}: SessionDrawerProps) {
  if (sessionContext.turns.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            className="fixed inset-0 z-30"
            style={{ background: "hsl(28 18% 14% / 0.18)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="glass-strong fixed bottom-0 left-0 right-0 z-40 mx-auto max-w-xl rounded-t-[1.75rem] px-4 pb-4 pt-4 sm:rounded-t-[2rem] sm:px-5"
            style={{
              maxHeight: "min(82vh, 860px)",
              overflowY: "auto",
              paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
              boxShadow: "0 -12px 48px hsl(28 28% 42% / 0.14)",
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-white/15" />

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 pr-4">
                <p className="text-sm text-secondary-otto">Current walk</p>
                <h2 className="mt-1 truncate text-2xl font-semibold tracking-tight">
                  {sessionContext.activeSubject || "Live session"}
                </h2>
                {sessionContext.activeSubjectType && (
                  <p className="mt-2 text-sm text-secondary-otto">{sessionContext.activeSubjectType}</p>
                )}
                {sessionContext.summary && (
                  <p className="mt-3 max-w-md text-sm leading-6 text-foreground/80">{sessionContext.summary}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={onResetSession}
                  className="glass flex h-9 w-9 items-center justify-center rounded-full"
                  aria-label="Reset session"
                >
                  <RotateCcw size={16} />
                </button>
                <motion.button
                  onClick={onClose}
                  className="glass flex h-9 w-9 items-center justify-center rounded-full"
                  whileTap={{ scale: 0.94 }}
                  aria-label="Hide conversation"
                >
                  <X size={16} />
                </motion.button>
              </div>
            </div>

            {latestReply && (
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="glass rounded-full px-3 py-1.5 text-secondary-otto">
                  <Sparkles size={12} className="mr-1 inline-block text-primary" />
                  {confidenceLabel[latestReply.confidence]}
                </span>
                {latestReply.usedVision && (
                  <span className="glass rounded-full px-3 py-1.5 text-secondary-otto">
                    <Eye size={12} className="mr-1 inline-block text-primary" />
                    Vision read
                  </span>
                )}
                {latestReply.usedWebSearch && (
                  <span className="glass rounded-full px-3 py-1.5 text-secondary-otto">
                    <Globe size={12} className="mr-1 inline-block text-primary" />
                    Web verified
                  </span>
                )}
              </div>
            )}

            {latestReply && canSpeak && (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={onReplay}
                  className="glass-button flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm sm:w-auto sm:justify-start sm:py-2"
                >
                  <Volume2 size={14} className={isSpeaking ? "text-primary" : "text-secondary-otto"} />
                  {isSpeaking ? "Speaking..." : "Replay audio"}
                </button>
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="glass-button flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm sm:w-auto sm:justify-start sm:py-2"
                >
                  {isMuted ? <MicOff size={14} className="text-secondary-otto" /> : <Mic2 size={14} className="text-primary" />}
                  {isMuted ? "Unmute replies" : "Mute replies"}
                </button>
              </div>
            )}

            <div className="mt-6 space-y-4">
              {sessionContext.turns.map((turn) => {
                const isLatestAssistantTurn =
                  turn.role === "assistant" && turn.reply.messageId === latestReply?.messageId;

                if (turn.role === "user") {
                  return (
                    <div key={turn.id} className="flex justify-end">
                      <div className="glass max-w-[88%] rounded-[1.5rem] rounded-br-md px-4 py-3">
                        <p className="text-sm leading-6 text-foreground">{turn.content}</p>
                        <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-secondary-otto">
                          {formatTime(turn.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={turn.id} className="space-y-3">
                    <div className="glass-panel rounded-[1.75rem] rounded-bl-md px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-foreground">{turn.reply.subject}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-secondary-otto">
                            {turn.reply.subjectType}
                          </p>
                        </div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-secondary-otto">
                          {formatTime(turn.createdAt)}
                        </p>
                      </div>
                      <p className="mt-4 text-sm leading-7 text-foreground/90">{turn.content}</p>
                    </div>

                    {isLatestAssistantTurn && turn.reply.structuredDetails.length > 0 && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {turn.reply.structuredDetails.map((detail) => (
                          <div key={`${detail.label}-${detail.value}`} className="glass-tile px-4 py-3">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-secondary-otto">{detail.label}</p>
                            <p className="mt-2 text-sm leading-6 text-foreground/90">{detail.value}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {isLatestAssistantTurn && turn.reply.suggestedFollowUps.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {turn.reply.suggestedFollowUps.map((item) => (
                          <span key={item} className="glass rounded-full px-3 py-2 text-xs text-secondary-otto">
                            {item}
                          </span>
                        ))}
                      </div>
                    )}

                    {isLatestAssistantTurn && turn.reply.callProposal && (
                      <button
                        type="button"
                        onClick={onReviewTaskProposal}
                        className="glass-button-primary inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium sm:w-auto"
                      >
                        <Phone size={14} />
                        Review call proposal
                      </button>
                    )}

                    {isLatestAssistantTurn && turn.reply.sources.length > 0 && (
                      <div className="space-y-3">
                        {turn.reply.sources.map((source) => (
                          <SourceCard key={source.url} source={source} />
                        ))}
                      </div>
                    )}

                    {isLatestAssistantTurn && turn.reply.actions.length > 0 && (
                      <div className="flex flex-wrap gap-3">
                        {turn.reply.actions.map((action, index) => {
                          const className = index === 0 ? "glass-button-primary" : "glass-button";

                          if (!action.url) {
                            return (
                              <button
                                key={`${action.type}-${action.label}`}
                                type="button"
                                className={`${className} rounded-full px-5 py-3 text-sm font-medium opacity-60`}
                                disabled
                              >
                                {action.label}
                              </button>
                            );
                          }

                          return (
                            <a
                              key={`${action.type}-${action.label}`}
                              href={action.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`${className} inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium`}
                            >
                              {action.label}
                              <ExternalLink size={14} />
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
