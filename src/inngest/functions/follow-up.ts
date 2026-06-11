import { draftFollowUp } from "@/lib/anthropic";
import { sendGmail } from "@/lib/google/gmail";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CandidateProfile } from "@/lib/types";
import { inngest } from "../client";

/**
 * application/follow-up.scheduled → wait a few days, and if there's been no
 * reply, draft a follow-up and queue it for approval. On approval, send it via
 * the user's Gmail (if connected and we have a recruiter address); otherwise
 * the draft stays in the inbox for the user to send manually.
 */
export const followUp = inngest.createFunction(
  { id: "follow-up", retries: 1 },
  { event: "application/follow-up.scheduled" },
  async ({ event, step }) => {
    const { applicationId, userId } = event.data;
    const db = supabaseAdmin();

    await step.sleep("wait-before-follow-up", "5d");

    const ctx = await step.run("load-context", async () => {
      const { data: app } = await db
        .from("applications")
        .select("match_id, status")
        .eq("id", applicationId)
        .eq("user_id", userId)
        .single();
      if (!app || app.status !== "submitted") return null;

      // If a reply already arrived, skip the nudge.
      const { count } = await db
        .from("communications")
        .select("id", { count: "exact", head: true })
        .eq("application_id", applicationId)
        .eq("direction", "inbound");
      if ((count ?? 0) > 0) return null;

      const { data: match } = await db
        .from("job_matches")
        .select("job_id")
        .eq("id", app.match_id)
        .single();
      const [{ data: job }, { data: profileRow }] = await Promise.all([
        db
          .from("job_listings")
          .select("title, company, apply_email, apply_method")
          .eq("id", match?.job_id)
          .single(),
        db
          .from("candidate_profiles")
          .select("profile")
          .eq("user_id", userId)
          .single(),
      ]);
      if (!job) return null;
      const profile = profileRow?.profile as CandidateProfile | undefined;
      return {
        jobTitle: job.title as string,
        company: job.company as string,
        recipient: (job.apply_email as string | null) ?? null,
        candidateName: profile?.fullName ?? "the candidate",
      };
    });
    if (!ctx) return { skipped: "replied, not submitted, or missing data" };

    const draft = await step.run("draft-follow-up", () =>
      draftFollowUp(ctx.candidateName, ctx.jobTitle, ctx.company),
    );

    const approvalId = await step.run("create-approval", async () => {
      const { data, error } = await db
        .from("approvals")
        .insert({
          user_id: userId,
          application_id: applicationId,
          type: "follow_up",
          payload: {
            jobTitle: ctx.jobTitle,
            company: ctx.company,
            recipient: ctx.recipient,
            subject: draft.subject,
            body: draft.body,
          },
        })
        .select("id")
        .single();
      if (error) throw new Error(`approval insert failed: ${error.message}`);
      return data.id as string;
    });

    const decision = await step.waitForEvent("wait-decision", {
      event: "application/approval.resolved",
      timeout: "14d",
      if: `async.data.approvalId == "${approvalId}"`,
    });
    if (!decision || decision.data.decision !== "approved") {
      return { approvalId, outcome: "not-sent" };
    }

    await step.run("send-follow-up", async () => {
      let threadId: string | null = null;
      if (ctx.recipient) {
        const sent = await sendGmail(userId, {
          to: ctx.recipient,
          subject: draft.subject,
          body: draft.body,
        });
        threadId = sent?.threadId ?? null;
      }
      await db.from("communications").insert({
        user_id: userId,
        application_id: applicationId,
        direction: "outbound",
        gmail_thread_id: threadId,
        subject: draft.subject,
        body: draft.body,
      });
      await db.from("activity_events").insert({
        user_id: userId,
        kind: "follow_up_sent",
        message: ctx.recipient
          ? `Sent a follow-up to ${ctx.company}`
          : `Follow-up drafted for ${ctx.company} (no recruiter email on file)`,
        metadata: { applicationId },
      });
    });

    return { approvalId, outcome: "sent" };
  },
);
