import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env";

/**
 * AES-256-GCM encryption for OAuth tokens at rest. The encryption key is a
 * base64-encoded 32-byte secret in INTEGRATION_ENCRYPTION_KEY. Ciphertext is
 * stored as `iv:authTag:data` (all base64) in integrations.encrypted_tokens.
 *
 * Tokens are NEVER logged. Decrypt only at the moment of use, in memory.
 */

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const k = Buffer.from(env.integrationEncryptionKey(), "base64");
  if (k.length !== 32) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  }
  return k;
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    data.toString("base64"),
  ].join(":");
}

export function decryptJson<T>(ciphertext: string): T {
  const [ivB64, tagB64, dataB64] = ciphertext.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed ciphertext");
  }
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
