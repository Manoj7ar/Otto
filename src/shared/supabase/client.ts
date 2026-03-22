export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing VITE_SUPABASE_URL. Configure the frontend Supabase URL before starting Otto.");
}

if (!supabasePublishableKey) {
  throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY. Configure the frontend publishable key before starting Otto.");
}
