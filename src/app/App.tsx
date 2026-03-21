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
import { fetchInboxTasks } from "@/features/tasks/api/fetchInboxTasks";
import TaskHistoryPanel from "@/features/tasks/components/TaskHistoryPanel";
import type { InboxTask } from "@/features/tasks/types";
import { clearSupabaseBrowserSession, supabase } from "@/shared/supabase/client";

type AppTab = "otto" | "tasks" | "account";

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
  const [tasks, setTasks] = useState<InboxTask[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>("otto");
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const resetInvalidSession = useCallback(async (message = "Your Otto session expired. Sign in again.") => {
    await clearSupabaseBrowserSession();
    setSession(null);
    setProfile(null);
    setTasks([]);
    setActiveTab("otto");
    toast.error(message);
  }, []);

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
      setTasks(await fetchInboxTasks(userId));
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

      if (data.session) {
        const { error: userError } = await supabase.auth.getUser();

        if (userError) {
          console.error("session_validation_error", userError);

          if (/invalid jwt/i.test(userError.message)) {
            if (mounted) {
              await resetInvalidSession("The saved Otto session was invalid and has been cleared. Sign in again.");
            }

            return;
          }
        }
      }

      setSession(data.session);

      if (data.session?.user.id) {
        try {
          await Promise.all([loadProfile(data.session.user.id), loadTasks(data.session.user.id)]);
        } catch (loadError) {
          console.error("app_bootstrap_error", loadError);
          const message = loadError instanceof Error ? loadError.message : "Could not load the Otto cloud profile.";

          if (/invalid jwt/i.test(message)) {
            await resetInvalidSession("The saved Otto session was invalid and has been cleared. Sign in again.");
            return;
          }

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
        if (error instanceof Error && /invalid jwt/i.test(error.message)) {
          void resetInvalidSession("The Otto session became invalid and has been cleared. Sign in again.");
          return;
        }

        toast.error("Could not load the Otto cloud profile.");
      });
      void loadTasks(nextSession.user.id).catch((error) => {
        console.error("task_load_error", error);
        if (error instanceof Error && /invalid jwt/i.test(error.message)) {
          void resetInvalidSession("The Otto session became invalid and has been cleared. Sign in again.");
        }
      });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile, loadTasks, resetInvalidSession]);

  const handleAuthSubmit = useCallback(async (mode: "sign_in" | "sign_up", email: string, password: string) => {
    const trimmedPassword = password.trim();

    if (mode === "sign_in" && !trimmedPassword) {
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
      return;
    }

    if (!trimmedPassword) {
      throw new Error("Password is required.");
    }

    if (mode === "sign_in") {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: trimmedPassword,
      });

      if (error) {
        throw error;
      }

      if (data.session) {
        toast.success("Signed in.");
      }

      return;
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: trimmedPassword,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (signUpError) {
      throw signUpError;
    }

    if (signUpData.session) {
      toast.success("Account created.");
      return;
    }

    toast.success("Check your email to confirm the new account.");
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
    await clearSupabaseBrowserSession();

    toast.success("Signed out.");
  }, []);

  const handleResetAuth = useCallback(async () => {
    await clearSupabaseBrowserSession();
    setSession(null);
    setProfile(null);
    setTasks([]);
    setActiveTab("otto");
    toast.success("Cleared the local Otto session.");
  }, []);

  const handleRefreshTasks = useCallback(async () => {
    if (!session?.user.id) {
      return;
    }

    await loadTasks(session.user.id);
  }, [loadTasks, session?.user.id]);

  useEffect(() => {
    if (activeTab !== "tasks" || !session?.user.id) {
      return;
    }

    const hasActiveTasks = tasks.some((task) => task.inbox_state === "active" || task.inbox_state === "waiting_approval");

    if (!hasActiveTasks) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadTasks(session.user.id).catch((error) => {
        console.error("task_poll_error", error);
      });
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [activeTab, loadTasks, session?.user.id, tasks]);

  if (session === undefined || loadingProfile) {
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

  const user = session?.user ?? null;
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

      {!user && <AuthScreen onSubmit={handleAuthSubmit} onResetAuth={handleResetAuth} />}

      {user && !onboardingComplete && (
        <OnboardingScreen profile={profile} busy={savingProfile} onSubmit={handleSaveProfile} />
      )}

      {user && onboardingComplete && profile && (
        <div
          className={
            activeTab === "otto"
              ? "flex h-[100dvh] flex-col overflow-hidden"
              : "min-h-[100dvh] pb-[calc(6.5rem+env(safe-area-inset-bottom))]"
          }
        >
          <header className="sticky top-0 z-40 bg-transparent">
            <div className="mx-auto flex max-w-5xl justify-center px-4 py-4">
              <div className="glass grid w-full max-w-sm grid-cols-3 rounded-full p-1">
                {(["tasks", "otto", "account"] as AppTab[]).map((tab) => (
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
