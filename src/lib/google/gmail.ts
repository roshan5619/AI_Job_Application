import { google } from "googleapis";
import { googleClientForUser } from "./client";

/**
 * Gmail send + read helpers, acting as the user (their identity = good sending
 * reputation). Returns null when the user hasn't connected Google.
 */

export interface SendResult {
  messageId: string;
  threadId: string;
}

/** Send an email from the user's Gmail. RFC 2822 message, base64url-encoded. */
export async function sendGmail(
  userId: string,
  args: { to: string; subject: string; body: string; threadId?: string },
): Promise<SendResult | null> {
  const auth = await googleClientForUser(userId);
  if (!auth) return null;
  const gmail = google.gmail({ version: "v1", auth });

  const raw = Buffer.from(
    [
      `To: ${args.to}`,
      `Subject: ${args.subject}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      args.body,
    ].join("\r\n"),
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId: args.threadId },
  });
  return { messageId: res.data.id ?? "", threadId: res.data.threadId ?? "" };
}

export interface InboundMessage {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  body: string;
}

/** Fetch the latest inbound message in a thread (for reply triage). */
export async function getLatestInbound(
  userId: string,
  threadId: string,
): Promise<InboundMessage | null> {
  const auth = await googleClientForUser(userId);
  if (!auth) return null;
  const gmail = google.gmail({ version: "v1", auth });

  const thread = await gmail.users.threads.get({ userId: "me", id: threadId });
  const messages = thread.data.messages ?? [];
  // Walk newest-first; return the first message not sent by the user.
  for (const m of [...messages].reverse()) {
    const headers = m.payload?.headers ?? [];
    const from = headers.find((h) => h.name === "From")?.value ?? "";
    const labelIds = m.labelIds ?? [];
    if (labelIds.includes("SENT")) continue; // skip our own outbound
    const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
    return {
      messageId: m.id ?? "",
      threadId,
      from,
      subject,
      body: extractPlainText(m.payload) || (m.snippet ?? ""),
    };
  }
  return null;
}

// Minimal MIME walk to pull text/plain content from a Gmail message payload.
function extractPlainText(payload: unknown): string {
  const p = payload as {
    mimeType?: string;
    body?: { data?: string };
    parts?: unknown[];
  };
  if (!p) return "";
  if (p.mimeType === "text/plain" && p.body?.data) {
    return Buffer.from(p.body.data, "base64").toString("utf8");
  }
  for (const part of p.parts ?? []) {
    const text = extractPlainText(part);
    if (text) return text;
  }
  return "";
}
