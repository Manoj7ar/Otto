import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabaseProjectRef = new URL(supabaseUrl).hostname.split(".")[0];
const storageKey = `sb-${supabaseProjectRef}-auth-token`;

if (!supabaseUrl) {
  throw new Error("Missing VITE_SUPABASE_URL. Configure the frontend Supabase URL before starting Otto.");
}

if (!supabasePublishableKey) {
  throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY. Configure the frontend publishable key before starting Otto.");
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    storageKey,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});

export async function clearSupabaseBrowserSession() {
  if (typeof window === "undefined") {
    return;
  }

  const keys = new Set<string>([storageKey]);

  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);

      if (!key) {
        continue;
      }

      if (key === storageKey || key.toLowerCase().includes("supabase")) {
        keys.add(key);
      }
    }
  }

  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);

  for (const key of keys) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
}
