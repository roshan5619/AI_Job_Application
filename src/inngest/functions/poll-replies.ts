import { triageReply } from "@/lib/anthropic";
import { getLatestInbound } from "@/lib/google/gmail";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { inngest } from "../client";

/**
 * Hourly: scan threads we've emailed on, ingest any new recruiter replies,
 * classify them (Claude), and — when a reply asks to schedule — kick off
 * interview scheduling. Only threads created by our own outbound Gmail sends
 * are tracked, so this needs the user to have connected Google.
 */
export const pollReplies = inngest.createFunction(
  { id: "poll-replies" },
  { cron: "0 * * * *" },
  async ({ step }) => {
    const db = supabaseAdmin();

    const threads = await step.run("load-tracked-threads", async () => {
      const { data } = await db
        .from("communications")
        .select("user_id, application_id, gmail_thread_id")
        .eq("direction", "outbound")
        .not("gmail_thread_id", "is", null);
      // Dedupe (user, thread).
      const seen = new Set<string>();
      return (data ?? []).filter((r) => {
        const key = `${r.user_id}:${r.gmail_thread_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });

    const toSchedule = await step.run("ingest-and-triage", async () => {
      const events: {
        applicationId: string;
        userId: string;
        recruiterEmail: string | null;
        threadId: string | null;
      }[] = [];

      for (const t of threads) {
        const userId = t.user_id as string;
        const threadId = t.gmail_thread_id as string;
        const applicationId = t.application_id as string;

        const inbound = await getLatestInbound(userId, threadId);
        if (!inbound?.messageId) continue;

        // Skip if we've already stored this message.
        const { count } = await db
          .from("communications")
          .select("id", { count: "exact", head: true })
          .eq("gmail_message_id", inbound.messageId);
        if ((count ?? 0) > 0) continue;

        const triage = await triageReply(inbound.subject, inbound.body);

        await db.from("communications").insert({
          user_id: userId,
          application_id: applicationId,
          direction: "inbound",
          gmail_thread_id: threadId,
          gmail_message_id: inbound.messageId,
          subject: inbound.subject,
          body: inbound.body,
          classified_intent: triage.intent,
        });

        await db.from("activity_events").insert({
          user_id: userId,
          kind: "reply_received",
          message: `Reply received (${triage.intent}): ${triage.summary}`,
          metadata: { applicationId },
        });

        if (triage.intent === "interview_request") {
          events.push({
            applicationId,
            userId,
            recruiterEmail: inbound.from || null,
            threadId,
          });
        }
      }
      return events;
    });

    if (toSchedule.length > 0) {
      await step.sendEvent(
        "request-scheduling",
        toSchedule.map((e) => ({
          name: "interview/schedule.requested" as const,
          data: e,
        })),
      );
    }
    return { threads: threads.length, scheduling: toSchedule.length };
  },
);
