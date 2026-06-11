import { NextRequest, NextResponse } from "next/server";
import { GOOGLE_SCOPES, oauthClient } from "@/lib/google/oauth";
import { saveGoogleTokens } from "@/lib/integrations";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * GET /api/integrations/google/callback — exchange the consent code for tokens
 * and persist them encrypted. Attribution uses the session user (same browser),
 * so a leaked state value can't bind tokens to someone else's account.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);
  if (!code) return NextResponse.redirect(`${origin}/inbox?google=error`);

  try {
    const { tokens } = await oauthClient().getToken(code);
    await saveGoogleTokens(
      user.id,
      {
        access_token: tokens.access_token ?? "",
        refresh_token: tokens.refresh_token ?? undefined,
        expiry_date: tokens.expiry_date ?? undefined,
        token_type: tokens.token_type ?? undefined,
        scope: tokens.scope ?? undefined,
      },
      tokens.scope?.split(" ") ?? GOOGLE_SCOPES,
    );
    return NextResponse.redirect(`${origin}/inbox?google=connected`);
  } catch {
    return NextResponse.redirect(`${origin}/inbox?google=error`);
  }
}
