import { LogOut } from "lucide-react";
import { toast } from "sonner";
import type { ProfileRow } from "../profile";
import type { ProfileFormValues } from "../profile";
import ProfileForm from "./ProfileForm";

interface AccountPanelProps {
  profile: ProfileRow;
  email: string | null;
  busy?: boolean;
  onSave: (values: ProfileFormValues) => Promise<void>;
  onSignOut: () => Promise<void>;
}

export default function AccountPanel({ profile, email, busy = false, onSave, onSignOut }: AccountPanelProps) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-32 pt-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-secondary-otto">Account</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Cloud call profile</h1>
          {email && <p className="mt-3 text-sm text-secondary-otto">Signed in as {email}</p>}
        </div>
        <button
          type="button"
          onClick={() => {
            void onSignOut().catch((error) => {
              toast.error(error instanceof Error ? error.message : "Could not sign out.");
            });
          }}
          className="glass-button inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>

      <ProfileForm
        profile={profile}
        busy={busy}
        submitLabel="Save profile"
        title="Keep Otto's cloud context accurate"
        description="These fields shape how Otto researches, who it calls, and the number it uses to call you back after cloud-run business calls."
        onSubmit={onSave}
      />
    </div>
  );
}
