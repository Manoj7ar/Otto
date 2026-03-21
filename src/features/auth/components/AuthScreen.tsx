import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

type AuthMode = "sign_in" | "sign_up";

interface AuthScreenProps {
  onSubmit: (mode: AuthMode, email: string, password: string) => Promise<void>;
  onResetAuth: () => Promise<void>;
}

export default function AuthScreen({ onSubmit, onResetAuth }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-10">
      <div className="glass-strong w-full max-w-md rounded-[2rem] p-7 sm:p-8">
        <p className="text-sm text-secondary-otto">Hello, Welcome to Otto</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          {mode === "sign_in" ? "Sign In" : "Sign Up"}
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-secondary-otto">
          World&apos;s first autonomous agent that takes action anytime, anywhere.
        </p>
        <button
          type="button"
          onClick={() => {
            void onResetAuth().catch((error) => {
              toast.error(error instanceof Error ? error.message : "Could not clear the saved session.");
            });
          }}
          className="mt-4 text-sm text-secondary-otto underline underline-offset-4"
        >
          Reset saved session
        </button>

        <div className="glass mt-8 grid grid-cols-2 gap-2 rounded-[1.5rem] p-1">
          <button
            type="button"
            onClick={() => setMode("sign_in")}
            className={`rounded-[1.1rem] px-4 py-3 text-sm font-medium transition-colors ${
              mode === "sign_in" ? "bg-white/18 text-foreground" : "text-secondary-otto"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("sign_up")}
            className={`rounded-[1.1rem] px-4 py-3 text-sm font-medium transition-colors ${
              mode === "sign_up" ? "bg-white/18 text-foreground" : "text-secondary-otto"
            }`}
          >
            Sign Up
          </button>
        </div>

        <form
          className="mt-4 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const nextEmail = email.trim();

            if (!nextEmail) {
              return;
            }

            setBusy(true);

            try {
              await onSubmit(mode, nextEmail, password);
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : mode === "sign_in"
                    ? "Could not sign in."
                    : "Could not sign up."
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="glass block rounded-[1.5rem] px-4 py-3">
            <span className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              className="mt-3 w-full bg-transparent text-base text-foreground outline-none placeholder:text-secondary-otto/60"
            />
          </label>

          <label className="glass block rounded-[1.5rem] px-4 py-3">
            <span className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              className="mt-3 w-full bg-transparent text-base text-foreground outline-none placeholder:text-secondary-otto/60"
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="glass-button-primary mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[1.5rem] px-4 py-3 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
            {mode === "sign_in" ? "Sign In" : "Sign Up"}
          </button>
        </form>
      </div>
    </div>
  );
}
