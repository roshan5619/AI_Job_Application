import { supabaseAdmin } from "@/lib/supabase/admin";
import { inngest } from "../client";

/**
 * application/ready → pause until the user decides on the approval card, then
 * act. This is the human-in-the-loop gate: nothing is submitted without an
 * explicit `application/approval.resolved` event from the Approval Inbox.
 *
 * On approve we run "assisted apply": the package (tailored PDF + cover letter
 * + answers) is finalized and the application is marked submitted. Direct ATS
 * submission can later be branched in here for sources that support it.
 */
export const awaitApproval = inngest.createFunction(
  { id: "await-approval", retries: 1 },
  { event: "application/ready" },
  async ({ event, step }) => {
    const { applicationId, approvalId, userId } = event.data;
    const db = supabaseAdmin();

    const decision = await step.waitForEvent("wait-for-decision", {
      event: "application/approval.resolved",
      timeout: "30d",
      if: `async.data.approvalId == "${approvalId}"`,
    });

    if (!decision) {
      // No decision within the window — leave it pending in the inbox.
      return { applicationId, outcome: "timeout" };
    }

    const approved = decision.data.decision === "approved";

    await step.run("apply-decision", async () => {
      if (!approved) {
        await db
          .from("applications")
          .update({ status: "rejected", updated_at: new Date().toISOString() })
          .eq("id", applicationId)
          .eq("user_id", userId);
        await db
          .from("job_matches")
          .update({ status: "rejected", updated_at: new Date().toISOString() })
          .eq("id", await matchIdFor(db, applicationId))
          .eq("user_id", userId);
        return;
      }

      // Idempotent submit: only the first decision sets submitted_at.
      const { data: app } = await db
        .from("applications")
        .select("submitted_at, match_id")
        .eq("id", applicationId)
        .eq("user_id", userId)
        .single();
      if (app?.submitted_at) return; // already submitted — no double action

      await db
        .from("applications")
        .update({
          status: "submitted",
          submission_method: "assisted",
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", applicationId)
        .eq("user_id", userId);

      if (app?.match_id) {
        await db
          .from("job_matches")
          .update({ status: "applied", updated_at: new Date().toISOString() })
          .eq("id", app.match_id)
          .eq("user_id", userId);
      }

      await db.from("activity_events").insert({
        user_id: userId,
        kind: "application_submitted",
        message: "Application approved and submitted (assisted).",
        metadata: { applicationId },
      });
    });

    // After applying, schedule a follow-up nudge (Phase 5 consumes this).
    if (approved) {
      await step.sendEvent("schedule-follow-up", {
        name: "application/follow-up.scheduled",
        data: { applicationId, userId },
      });
    }

    return { applicationId, outcome: approved ? "submitted" : "rejected" };
  },
);

async function matchIdFor(
  db: ReturnType<typeof supabaseAdmin>,
  applicationId: string,
): Promise<string> {
  const { data } = await db
    .from("applications")
    .select("match_id")
    .eq("id", applicationId)
    .single();
  return (data?.match_id as string) ?? "";
}
