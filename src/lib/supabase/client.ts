import { createBrowserClient } from "@supabase/ssr";
import { env } from "../env";

/** Browser Supabase client (anon key). RLS-scoped to the signed-in user. */
export function supabaseBrowser() {
  return createBrowserClient(env.supabaseUrl(), env.supabaseAnonKey());
}
