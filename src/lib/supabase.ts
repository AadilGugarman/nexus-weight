import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [];
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY');
  
  throw new Error(
    `Missing Supabase environment variables: ${missing.join(', ')}. ` +
    `Please ensure these are defined in your .env file or deployment environment.`
  );
}

// Singleton pattern to prevent multiple GoTrueClient instances
// This fixes the "Multiple GoTrueClient instances detected" warning
let supabaseInstance: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'nexus-weight-auth', // Unique storage key
      },
    });
  }
  return supabaseInstance;
}

const supabase = getSupabaseClient();

export default supabase;
