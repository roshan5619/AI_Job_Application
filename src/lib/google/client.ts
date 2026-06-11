import { OAuth2Client } from "google-auth-library";
import { getGoogleTokens, saveGoogleTokens } from "../integrations";
import { GOOGLE_SCOPES, oauthClient } from "./oauth";

/**
 * Build an authenticated OAuth2 client for a user from their stored tokens.
 * Refreshed tokens are persisted automatically (Google rotates access tokens
 * and occasionally refresh tokens). Returns null if the user hasn't connected.
 */
export async function googleClientForUser(
  userId: string,
): Promise<OAuth2Client | null> {
  const tokens = await getGoogleTokens(userId);
  if (!tokens) return null;

  const client = oauthClient();
  client.setCredentials(tokens);

  // Persist any tokens Google rotates during use.
  client.on("tokens", (fresh) => {
    const merged = {
      access_token: fresh.access_token ?? tokens.access_token,
      refresh_token: fresh.refresh_token ?? tokens.refresh_token,
      expiry_date: fresh.expiry_date ?? tokens.expiry_date,
      token_type: fresh.token_type ?? tokens.token_type,
      scope: fresh.scope ?? tokens.scope,
    };
    void saveGoogleTokens(userId, merged, GOOGLE_SCOPES).catch(() => {
      /* best-effort; next call will refresh again if needed */
    });
  });

  return client;
}
