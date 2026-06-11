import { scoreJob } from "@/lib/anthropic";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  CandidateProfile,
  JobListing,
  MissionPreferences,
} from "@/lib/types";
import { inngest } from "../client";

// Matches at or above this fit score get tailored & queued for review.
const SCORE_THRESHOLD = 70;

/**
 * match/score.requested → score one job against the candidate (Claude, with the
 * profile cached in the prompt prefix). High scorers advance to tailoring;
 * low scorers are skipped.
 */
export const score = inngest.createFunction(
  { id: "score", retries: 2, concurrency: { limit: 8 } },
  { event: "match/score.requested" },
  async ({ event, step }) => {
    const { matchId, userId } = event.data;
    const db = supabaseAdmin();

    const ctx = await step.run("load-context", async () => {
      const { data: match, error: matchErr } = await db
        .from("job_matches")
        .select("mission_id, job_id")
        .eq("id", matchId)
        .eq("user_id", userId)
        .single();
      if (matchErr) throw new Error(`Match not found: ${matchErr.message}`);

      const [{ data: job }, { data: mission }, { data: profileRow }] =
        await Promise.all([
          db.from("job_listings").select("*").eq("id", match.job_id).single(),
          db
            .from("missions")
            .select("preferences")
            .eq("id", match.mission_id)
            .single(),
          db
            .from("candidate_profiles")
            .select("profile")
            .eq("user_id", userId)
            .single(),
        ]);

      if (!job || !mission?.preferences || !profileRow?.profile) {
        throw new Error("Missing job, preferences, or candidate profile");
      }

      const listing: JobListing = {
        source: job.source,
        externalId: job.external_id,
        title: job.title,
        company: job.company,
        location: job.location,
        remote: job.remote,
        compMin: job.comp_min,
        compMax: job.comp_max,
        description: job.description,
        applyUrl: job.apply_url,
        applyMethod: job.apply_method,
        applyEmail: job.apply_email,
        postedAt: job.posted_at,
      };
      return {
        listing,
        preferences: mission.preferences as MissionPreferences,
        profile: profileRow.profile as CandidateProfile,
      };
    });

    const result = await step.run("score-job", () =>
      scoreJob(ctx.profile, ctx.preferences, ctx.listing),
    );

    const advancing = result.score >= SCORE_THRESHOLD;

    await step.run("save-score", async () => {
      const { error } = await db
        .from("job_matches")
        .update({
          score: result.score,
          rationale: result.rationale,
          status: advancing ? "tailoring" : "skipped",
          updated_at: new Date().toISOString(),
        })
        .eq("id", matchId)
        .eq("user_id", userId);
      if (error) throw new Error(`Failed to save score: ${error.message}`);
    });

    if (advancing) {
      await step.sendEvent("request-tailor", {
        name: "match/tailor.requested",
        data: { matchId, userId },
      });
    }

    return { matchId, score: result.score, advancing };
  },
);
