import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";

/**
 * Service-role Supabase client for server-side workflows (Inngest functions,
 * trusted API routes). This BYPASSES RLS — every query must scope by user_id
 * explicitly. Never expose this client or its key to the browser.
 */
let _admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}
