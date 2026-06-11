import { createEvent, getBusy, proposeSlots } from "@/lib/google/calendar";
import { sendGmail } from "@/lib/google/gmail";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { inngest } from "../client";

/** Pull a bare email address out of a From header like `Name <a@b.com>`. */
function parseEmail(from: string | null): string | null {
  if (!from) return null;
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim() || null;
}

/**
 * interview/schedule.requested → read the user's calendar, propose open slots,
 * and queue an interview-proposal approval. On approval (with a chosen slot),
 * book the event and reply to the recruiter with the confirmed time.
 */
export const scheduleInterview = inngest.createFunction(
  { id: "schedule-interview", retries: 1 },
  { event: "interview/schedule.requested" },
  async ({ event, step }) => {
    const { applicationId, userId, recruiterEmail, threadId } = event.data;
    const db = supabaseAdmin();

    const job = await step.run("load-job", async () => {
      const { data: app } = await db
        .from("applications")
        .select("match_id")
        .eq("id", applicationId)
        .eq("user_id", userId)
        .single();
      const { data: match } = await db
        .from("job_matches")
        .select("job_id")
        .eq("id", app?.match_id)
        .single();
      const { data: listing } = await db
        .from("job_listings")
        .select("title, company")
        .eq("id", match?.job_id)
        .single();
      return {
        title: (listing?.title as string) ?? "Interview",
        company: (listing?.company as string) ?? "",
      };
    });

    const slots = await step.run("propose-slots", async () => {
      const now = new Date();
      const max = new Date(now.getTime() + 8 * 24 * 3600 * 1000);
      const busy = await getBusy(userId, now.toISOString(), max.toISOString());
      return proposeSlots(busy, { days: 8, count: 3, durationMin: 45 });
    });

    const approvalId = await step.run("create-proposal", async () => {
      await db.from("interviews").insert({
        user_id: userId,
        application_id: applicationId,
        proposed_slots: slots,
        status: "proposed",
      });
      const { data, error } = await db
        .from("approvals")
        .insert({
          user_id: userId,
          application_id: applicationId,
          type: "interview_proposal",
          payload: {
            jobTitle: job.title,
            company: job.company,
            recruiterEmail,
            slots,
          },
        })
        .select("id")
        .single();
      if (error) throw new Error(`approval insert failed: ${error.message}`);

      await db.from("activity_events").insert({
        user_id: userId,
        kind: "interview_proposed",
        message: `Interview requested by ${job.company} — proposed ${slots.length} times for your review`,
        metadata: { applicationId },
      });
      return data.id as string;
    });

    const decision = await step.waitForEvent("wait-slot", {
      event: "application/approval.resolved",
      timeout: "14d",
      if: `async.data.approvalId == "${approvalId}"`,
    });
    if (
      !decision ||
      decision.data.decision !== "approved" ||
      !decision.data.selectedSlot
    ) {
      return { approvalId, outcome: "not-scheduled" };
    }

    const chosen = decision.data.selectedSlot;

    await step.run("book-and-confirm", async () => {
      const recipient = parseEmail(recruiterEmail);
      const start = chosen;
      const end = new Date(
        new Date(chosen).getTime() + 45 * 60_000,
      ).toISOString();

      const created = await createEvent(userId, {
        summary: `Interview: ${job.title} @ ${job.company}`,
        description: `Scheduled via AI Execution Agent for application ${applicationId}.`,
        start,
        end,
        attendees: recipient ? [recipient] : undefined,
      });

      await db
        .from("interviews")
        .update({
          scheduled_at: start,
          gcal_event_id: created?.eventId ?? null,
          status: "scheduled",
        })
        .eq("application_id", applicationId)
        .eq("user_id", userId);

      if (recipient) {
        const when = new Date(start).toLocaleString();
        const sent = await sendGmail(userId, {
          to: recipient,
          subject: `Re: ${job.title} interview`,
          body: `Thanks for reaching out — ${when} works for me. I've sent a calendar invite. Looking forward to it.`,
          threadId: threadId ?? undefined,
        });
        await db.from("communications").insert({
          user_id: userId,
          application_id: applicationId,
          direction: "outbound",
          gmail_thread_id: sent?.threadId ?? threadId,
          subject: `Re: ${job.title} interview`,
          body: `Confirmed ${when}`,
        });
      }

      await db.from("activity_events").insert({
        user_id: userId,
        kind: "interview_scheduled",
        message: `Interview booked with ${job.company} for ${new Date(start).toLocaleString()}`,
        metadata: { applicationId },
      });
    });

    return { approvalId, outcome: "scheduled", slot: chosen };
  },
);
