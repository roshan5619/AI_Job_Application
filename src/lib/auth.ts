import { redirect } from "next/navigation";
import { getCurrentUser } from "./supabase/server";

/**
 * Server-side guard for protected pages/routes. Returns the authenticated user
 * or redirects to /login.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
