import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "../env";

/**
 * Request-scoped Supabase client bound to the user's auth cookies. RLS applies,
 * so this client only ever sees the current user's rows. Use in Server
 * Components, Route Handlers, and Server Actions.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }[],
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component where cookies are read-only — safe
          // to ignore; the session refresh happens in middleware instead.
        }
      },
    },
  });
}

/** Returns the authenticated user or null. */
export async function getCurrentUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
