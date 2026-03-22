import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { ProfileRow } from "../profile";
import type { ProfileFormValues } from "../profile";
import ProfileForm from "./ProfileForm";

interface AccountPanelProps {
  profile: ProfileRow;
  busy?: boolean;
  onSave: (values: ProfileFormValues) => Promise<void>;
  onResetProfile: () => Promise<void>;
}

export default function AccountPanel({ profile, busy = false, onSave, onResetProfile }: AccountPanelProps) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-32 pt-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-secondary-otto">Account</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Otto profile</h1>
          <p className="mt-3 text-sm text-secondary-otto">Stored locally on this device for faster demos.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void onResetProfile().catch((error) => {
              toast.error(error instanceof Error ? error.message : "Could not clear the saved profile.");
            });
          }}
          className="glass-button inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm"
        >
          <RotateCcw size={16} />
          Reset local data
        </button>
      </div>

      <ProfileForm
        profile={profile}
        busy={busy}
        submitLabel="Save profile"
        title="Keep Otto's context accurate"
        description="These local defaults shape how Otto researches, interprets what you are seeing, and tailors results to your location and travel mode."
        onSubmit={onSave}
      />
    </div>
  );
}
