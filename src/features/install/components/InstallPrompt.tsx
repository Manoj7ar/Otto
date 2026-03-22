import { motion } from "framer-motion";
import { Download, Share, X } from "lucide-react";

interface InstallPromptProps {
  mode: "native" | "ios";
  onDismiss: () => void;
  onInstall: () => Promise<void> | void;
}

export default function InstallPrompt({ mode, onDismiss, onInstall }: InstallPromptProps) {
  const isIos = mode === "ios";

  return (
    <motion.div
      className="fixed inset-x-0 bottom-0 z-50 px-3 pt-4 sm:px-4"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 28 }}
    >
      <div className="glass-strong mx-auto max-w-md rounded-[2rem] px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <img
            src="/icon-192.png"
            alt="Otto app icon"
            className="h-14 w-14 shrink-0 rounded-[1.2rem] object-cover shadow-[0_14px_30px_rgba(0,0,0,0.08)]"
            draggable={false}
          />

          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.22em] text-secondary-otto">Install Otto</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">Add Otto to your home screen</h2>
            <p className="mt-2 text-sm leading-6 text-foreground/80">
              {isIos
                ? "Install Otto on your iPhone for a cleaner full-screen demo."
                : "Install Otto like an app for a cleaner, full-screen demo experience."}
            </p>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="glass-button inline-flex h-9 w-9 items-center justify-center rounded-full"
            aria-label="Dismiss install prompt"
          >
            <X size={16} />
          </button>
        </div>

        {isIos ? (
          <div className="mt-4 rounded-[1.4rem] border border-black/10 bg-white/30 px-4 py-4 text-sm text-foreground/85">
            <p className="leading-6">
              Tap <span className="inline-flex items-center gap-1 font-medium text-foreground"><Share size={14} /> Share</span>,
              then choose <span className="font-medium text-foreground">Add to Home Screen</span>.
            </p>
            <button
              type="button"
              onClick={onDismiss}
              className="glass-button-primary mt-4 inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-medium"
            >
              Got it
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void onInstall()}
              className="glass-button-primary inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium"
            >
              <Download size={16} />
              Install app
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="glass-button inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-medium"
            >
              Not now
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
