import { google } from "googleapis";
import { env } from "../env";

/**
 * Google OAuth 2.0 helpers for Gmail + Calendar. We request offline access so
 * we get a refresh token and can act on the user's behalf from background
 * workflows. Tokens are persisted encrypted (see src/lib/integrations.ts).
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export function oauthClient() {
  return new google.auth.OAuth2(
    env.googleClientId(),
    env.googleClientSecret(),
    env.googleOAuthRedirectUri(),
  );
}

/** Consent URL. `state` carries the user id so the callback can attribute it. */
export function getConsentUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force refresh_token on re-consent
    scope: GOOGLE_SCOPES,
    state,
  });
}
