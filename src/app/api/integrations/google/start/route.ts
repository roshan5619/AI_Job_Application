import { NextResponse } from "next/server";
import { getConsentUrl } from "@/lib/google/oauth";
import { getCurrentUser } from "@/lib/supabase/server";

/** GET /api/integrations/google/start — kick off the Google consent flow. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.redirect(getConsentUrl(user.id));
}
