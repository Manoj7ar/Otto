import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Toaster, toast } from "sonner";
import AuthScreen from "@/features/auth/components/AuthScreen";
import AccountPanel from "@/features/account/components/AccountPanel";
import {
  toProfileUpsert,
  type ProfileFormValues,
  type ProfileRow,
  validateProfileValues,
} from "@/features/account/profile";
import OnboardingScreen from "@/features/onboarding/components/OnboardingScreen";
import OttoPage from "@/features/otto/screens/OttoPage";
import TaskHistoryPanel from "@/features/tasks/components/TaskHistoryPanel";
import { supabase } from "@/shared/supabase/client";
import type { Database } from "@/shared/supabase/types";

type AppTab = "otto" | "tasks" | "account";
type OttoTaskRow = Database["public"]["Tables"]["otto_tasks"]["Row"];

function AppLoadingState() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4">
      <div className="glass-strong rounded-[2rem] px-6 py-5 text-sm text-secondary-otto">
        Restoring Otto cloud session...
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [tasks, setTasks] = useState<OttoTaskRow[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>("otto");
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const loadProfile = useCallback(async (userId: string) => {
    setLoadingProfile(true);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      setProfile(data);
      return data;
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  const loadTasks = useCallback(async (userId: string) => {
    setLoadingTasks(true);

    try {
      const { data, error } = await supabase
        .from("otto_tasks")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(25);

      if (error) {
        throw error;
      }

      setTasks(data ?? []);
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted) {
        return;
      }

      if (error) {
        console.error("session_restore_error", error);
        toast.error("Could not restore the current session.");
      }

      setSession(data.session);

      if (data.session?.user.id) {
        try {
          await Promise.all([loadProfile(data.session.user.id), loadTasks(data.session.user.id)]);
        } catch (loadError) {
          console.error("app_bootstrap_error", loadError);
          toast.error("Could not load the Otto cloud profile.");
        }
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);

      if (!nextSession?.user.id) {
        setProfile(null);
        setTasks([]);
        setActiveTab("otto");
        return;
      }

      void loadProfile(nextSession.user.id).catch((error) => {
        console.error("profile_load_error", error);
        toast.error("Could not load the Otto cloud profile.");
      });
      void loadTasks(nextSession.user.id).catch((error) => {
        console.error("task_load_error", error);
      });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile, loadTasks]);

  const handleSendMagicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      throw error;
    }

    toast.success("Magic link sent.");
  }, []);

  const handleSaveProfile = useCallback(
    async (values: ProfileFormValues) => {
      if (!session?.user.id) {
        throw new Error("No active session.");
      }

      const validationError = validateProfileValues(values);

      if (validationError) {
        toast.error(validationError);
        return;
      }

      setSavingProfile(true);

      try {
        const { data, error } = await supabase
          .from("profiles")
          .upsert(toProfileUpsert(session.user.id, values, true))
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        setProfile(data);
        toast.success(profile?.onboarding_completed_at ? "Profile updated." : "Onboarding complete.");
      } finally {
        setSavingProfile(false);
      }
    },
    [profile?.onboarding_completed_at, session?.user.id]
  );

  const handleSignOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    toast.success("Signed out.");
  }, []);

  const handleRefreshTasks = useCallback(async () => {
    if (!session?.user.id) {
      return;
    }

    await loadTasks(session.user.id);
  }, [loadTasks, session?.user.id]);

  if (session === undefined || loadingProfile) {
    return (
      <>
        <Toaster
          position="top-center"
          theme="dark"
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

  const user = session?.user ?? null;
  const onboardingComplete = Boolean(profile?.onboarding_completed_at);

  return (
    <>
      <Toaster
        position="top-center"
        theme="dark"
        toastOptions={{
          classNames: {
            toast: "border-border bg-card text-card-foreground shadow-lg",
            description: "text-muted-foreground",
            actionButton: "bg-primary text-primary-foreground",
            cancelButton: "bg-muted text-muted-foreground",
          },
        }}
      />

      {!user && <AuthScreen onSendMagicLink={handleSendMagicLink} />}

      {user && !onboardingComplete && (
        <OnboardingScreen profile={profile} busy={savingProfile} onSubmit={handleSaveProfile} />
      )}

      {user && onboardingComplete && profile && (
        <div className="min-h-[100dvh] pb-24">
          <header className="sticky top-0 z-40 border-b border-white/10 bg-background/80 backdrop-blur-2xl">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-secondary-otto">Otto cloud agent</p>
                <p className="mt-1 text-sm text-foreground/85">
                  {profile.current_region} • {profile.travel_mode}
                </p>
              </div>

              <div className="glass rounded-full p-1">
                {(["otto", "tasks", "account"] as AppTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-full px-4 py-2 text-sm capitalize transition-colors ${
                      activeTab === tab ? "bg-white/12 text-foreground" : "text-secondary-otto"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
          </header>

          {activeTab === "otto" && (
            <OttoPage
              profile={profile}
              onOpenTasks={() => setActiveTab("tasks")}
              onTaskCreated={handleRefreshTasks}
            />
          )}

          {activeTab === "tasks" && (
            <TaskHistoryPanel tasks={tasks} busy={loadingTasks} onRefresh={handleRefreshTasks} />
          )}

          {activeTab === "account" && (
            <AccountPanel
              profile={profile}
              email={user.email ?? null}
              busy={savingProfile}
              onSave={handleSaveProfile}
              onSignOut={handleSignOut}
            />
          )}
        </div>
      )}
    </>
  );
}
