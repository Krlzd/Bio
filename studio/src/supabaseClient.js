import { createClient } from "@supabase/supabase-js";

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

function getConfigurationError() {
  if (!projectUrl || !publishableKey) {
    return "Supabase is not configured. Copy .env.example to .env.local and add your project URL and publishable key.";
  }

  try {
    const url = new URL(projectUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return "The Supabase URL must use HTTPS.";
    }
  } catch {
    return "The Supabase project URL is not a valid URL.";
  }

  return "";
}

export const supabaseConfigurationError = getConfigurationError();
export const supabase = supabaseConfigurationError
  ? null
  : createClient(projectUrl, publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
