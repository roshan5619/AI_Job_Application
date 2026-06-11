import { decryptJson, encryptJson } from "./crypto";
import { supabaseAdmin } from "./supabase/admin";

/**
 * Encrypted OAuth-token storage for third-party integrations (Google).
 * Tokens are encrypted with AES-256-GCM before they touch the database and
 * decrypted only in memory at the point of use.
 */

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type?: string;
  scope?: string;
}

export async function saveGoogleTokens(
  userId: string,
  tokens: GoogleTokens,
  scopes: string[],
): Promise<void> {
  const encrypted_tokens = encryptJson(tokens);
  const { error } = await supabaseAdmin()
    .from("integrations")
    .upsert(
      {
        user_id: userId,
        provider: "google",
        encrypted_tokens,
        scopes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );
  if (error) throw new Error(`Failed to save Google tokens: ${error.message}`);
}

export async function getGoogleTokens(
  userId: string,
): Promise<GoogleTokens | null> {
  const { data, error } = await supabaseAdmin()
    .from("integrations")
    .select("encrypted_tokens")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();
  if (error) throw new Error(`Failed to load Google tokens: ${error.message}`);
  if (!data) return null;
  return decryptJson<GoogleTokens>(data.encrypted_tokens);
}
