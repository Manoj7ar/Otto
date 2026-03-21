import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

type AuthMode = "sign_in" | "sign_up";

interface AuthScreenProps {
  onSubmit: (mode: AuthMode, email: string, password: string) => Promise<void>;
}

export default function AuthScreen({ onSubmit }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center px-4 py-10"
      style={{ background: "#000000" }}
    >
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/6 p-7 backdrop-blur-2xl sm:p-8">
        <p className="text-sm text-white/60">Hello, Welcome to Otto</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          {mode === "sign_in" ? "Sign In" : "Sign Up"}
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-white/50">
          World&apos;s first autonomous agent that takes action anytime, anywhere.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-2 rounded-[1.5rem] border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setMode("sign_in")}
            className={`rounded-[1.1rem] px-4 py-3 text-sm font-medium transition-colors ${
              mode === "sign_in" ? "bg-white/12 text-white" : "text-white/45"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("sign_up")}
            className={`rounded-[1.1rem] px-4 py-3 text-sm font-medium transition-colors ${
              mode === "sign_up" ? "bg-white/12 text-white" : "text-white/45"
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
          <label className="block rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-3">
            <span className="text-xs uppercase tracking-[0.2em] text-white/45">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              className="mt-3 w-full bg-transparent text-base text-white outline-none placeholder:text-white/25"
            />
          </label>

          <label className="block rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-3">
            <span className="text-xs uppercase tracking-[0.2em] text-white/45">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              className="mt-3 w-full bg-transparent text-base text-white outline-none placeholder:text-white/25"
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[1.5rem] border border-white/12 bg-white/10 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/14 disabled:opacity-50"
          >
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
            {mode === "sign_in" ? "Sign In" : "Sign Up"}
          </button>
        </form>
      </div>
    </div>
  );
}
