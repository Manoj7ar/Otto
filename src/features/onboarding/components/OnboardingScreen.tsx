import ProfileForm from "@/features/account/components/ProfileForm";
import type { ProfileRow } from "@/features/account/profile";
import type { ProfileFormValues } from "@/features/account/profile";

interface OnboardingScreenProps {
  profile?: ProfileRow | null;
  busy?: boolean;
  onSubmit: (values: ProfileFormValues) => Promise<void>;
}

export default function OnboardingScreen({ profile, busy = false, onSubmit }: OnboardingScreenProps) {
  return (
    <div className="min-h-[100dvh] px-4 py-10">
      <ProfileForm
        profile={profile}
        busy={busy}
        submitLabel="Finish onboarding"
        title="Teach Otto how to operate for you"
        description="These defaults become the assistant's cloud memory for search context, call tasks, and callback briefings."
        onSubmit={onSubmit}
      />
    </div>
  );
}
