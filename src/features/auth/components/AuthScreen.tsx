import { useState } from "react";
import { LoaderCircle, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface AuthScreenProps {
  onSendMagicLink: (email: string) => Promise<void>;
}

export default function AuthScreen({ onSendMagicLink }: AuthScreenProps) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState("");

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute inset-0 opacity-60">
        <div className="absolute left-[10%] top-[12%] h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute right-[8%] top-[18%] h-48 w-48 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="absolute bottom-[14%] left-[28%] h-56 w-56 rounded-full bg-blue-600/12 blur-3xl" />
      </div>

      <div className="glass-strong relative z-10 w-full max-w-md rounded-[2rem] p-7 sm:p-8">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300/15 text-primary">
          <Sparkles size={20} />
        </div>
        <p className="mt-6 text-sm uppercase tracking-[0.24em] text-secondary-otto">Otto cloud agent</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sign in to start your walk assistant</h1>
        <p className="mt-3 text-sm leading-6 text-secondary-otto">
          Otto now stores your profile, location defaults, and call tasks in Supabase so the assistant can operate in the cloud.
        </p>

        <form
          className="mt-8"
          onSubmit={async (event) => {
            event.preventDefault();
            const nextEmail = email.trim();

            if (!nextEmail) {
              return;
            }

            setBusy(true);

            try {
              await onSendMagicLink(nextEmail);
              setSentTo(nextEmail);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not send the magic link.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="glass-panel block rounded-3xl p-4">
            <span className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Email</span>
            <div className="mt-3 flex items-center gap-3">
              <Mail size={16} className="text-secondary-otto" />
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full bg-transparent text-base outline-none placeholder:text-secondary-otto/60"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={busy}
            className="glass-button-primary mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium disabled:opacity-50"
          >
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Mail size={16} />}
            Send magic link
          </button>
        </form>

        {sentTo && (
          <div className="glass mt-6 rounded-3xl p-4 text-sm leading-6 text-foreground/85">
            Check <span className="font-medium">{sentTo}</span>. Otto sent a sign-in link so the app can restore your cloud profile.
          </div>
        )}
      </div>
    </div>
  );
}
