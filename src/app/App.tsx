import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Toaster, toast } from "sonner";
import AccountPanel from "@/features/account/components/AccountPanel";
import InstallPrompt from "@/features/install/components/InstallPrompt";
import { useInstallPrompt } from "@/features/install/useInstallPrompt";
import {
  buildStoredProfile,
  clearLocalProfile,
  readLocalProfile,
  type ProfileFormValues,
  type ProfileRow,
  validateProfileValues,
  writeLocalProfile,
} from "@/features/account/profile";
import OnboardingScreen from "@/features/onboarding/components/OnboardingScreen";
import OttoPage from "@/features/otto/screens/OttoPage";

type AppTab = "otto" | "account";

function AppLoadingState() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4">
      <div className="glass-strong rounded-[2rem] px-6 py-5 text-sm text-secondary-otto">
        Restoring local Otto settings...
      </div>
    </div>
  );
}

export default function App() {
  const [profile, setProfile] = useState<ProfileRow | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<AppTab>("otto");
  const [savingProfile, setSavingProfile] = useState(false);
  const installPrompt = useInstallPrompt();

  useEffect(() => {
    setProfile(readLocalProfile());
  }, []);

  const handleSaveProfile = useCallback(
    async (values: ProfileFormValues) => {
      const validationError = validateProfileValues(values);

      if (validationError) {
        toast.error(validationError);
        return;
      }

      setSavingProfile(true);

      try {
        const nextProfile = buildStoredProfile(values, profile, true);
        writeLocalProfile(nextProfile);
        setProfile(nextProfile);
        toast.success(profile?.onboarding_completed_at ? "Profile updated." : "Onboarding complete.");
      } finally {
        setSavingProfile(false);
      }
    },
    [profile]
  );

  const handleResetProfile = useCallback(async () => {
    clearLocalProfile();
    setProfile(null);
    setActiveTab("otto");
    toast.success("Cleared local Otto profile.");
  }, []);

  if (profile === undefined) {
    return (
      <>
        <Toaster
          position="top-center"
          theme="light"
          toastOptions={{
            classNames: {
              toast: "border-border bg-card text-card-foreground shadow-lg",
              description: "text-muted-foreground",
              actionButton: "bg-primary text-primary-foreground",
              cancelButton: "bg-muted text-muted-foreground",
            },
          }}
        />
        <AppLoadingState />
      </>
    );
  }

  const onboardingComplete = Boolean(profile?.onboarding_completed_at);

  return (
    <>
      <Toaster
        position="top-center"
        theme="light"
        toastOptions={{
          classNames: {
            toast: "border-border bg-card text-card-foreground shadow-lg",
            description: "text-muted-foreground",
            actionButton: "bg-primary text-primary-foreground",
            cancelButton: "bg-muted text-muted-foreground",
          },
        }}
      />

      {!onboardingComplete && (
        <OnboardingScreen profile={profile} busy={savingProfile} onSubmit={handleSaveProfile} />
      )}

      {onboardingComplete && profile && (
        <div
          className={
            activeTab === "otto"
              ? "flex h-[100dvh] flex-col overflow-hidden"
              : "min-h-[100dvh] pb-[calc(6.5rem+env(safe-area-inset-bottom))]"
          }
        >
          <header className="sticky top-0 z-40 bg-transparent">
            <div className="mx-auto flex max-w-5xl justify-center px-4 py-4">
              <div className="glass grid w-full max-w-xs grid-cols-2 rounded-full p-1">
                {(["otto", "account"] as AppTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-full px-4 py-2.5 text-sm capitalize transition-colors ${
                      activeTab === tab ? "bg-white/20 text-foreground" : "text-secondary-otto"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
          </header>

          {activeTab === "otto" && <OttoPage profile={profile} />}

          {activeTab === "account" && (
            <AccountPanel
              profile={profile}
              busy={savingProfile}
              onSave={handleSaveProfile}
              onResetProfile={handleResetProfile}
            />
          )}

          <AnimatePresence>
            {installPrompt.mode && (
              <InstallPrompt
                mode={installPrompt.mode}
                onDismiss={installPrompt.dismiss}
                onInstall={installPrompt.promptInstall}
              />
            )}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}
