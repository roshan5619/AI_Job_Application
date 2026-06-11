import { draftCoverLetter, tailorResume } from "@/lib/anthropic";
import { renderResumePdf } from "@/lib/resume/render";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CandidateProfile, JobListing } from "@/lib/types";
import { inngest } from "../client";

/**
 * match/tailor.requested → tailor the resume to the job, draft a cover letter,
 * render a tailored PDF, and create an application + an approval card. The
 * match becomes 'ready'; nothing is submitted until the user approves (Phase 4
 * consumes application/ready and waits for the decision).
 */
export const tailor = inngest.createFunction(
  { id: "tailor", retries: 2, concurrency: { limit: 4 } },
  { event: "match/tailor.requested" },
  async ({ event, step }) => {
    const { matchId, userId } = event.data;
    const db = supabaseAdmin();

    const ctx = await step.run("load-context", async () => {
      const { data: match, error } = await db
        .from("job_matches")
        .select("mission_id, job_id, score, rationale")
        .eq("id", matchId)
        .eq("user_id", userId)
        .single();
      if (error) throw new Error(`Match not found: ${error.message}`);

      const [{ data: job }, { data: profileRow }] = await Promise.all([
        db.from("job_listings").select("*").eq("id", match.job_id).single(),
        db
          .from("candidate_profiles")
          .select("profile")
          .eq("user_id", userId)
          .single(),
      ]);
      if (!job || !profileRow?.profile) {
        throw new Error("Missing job or candidate profile");
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
        missionId: match.mission_id as string,
        profile: profileRow.profile as CandidateProfile,
        score: match.score as number | null,
      };
    });

    const tailored = await step.run("tailor-resume", () =>
      tailorResume(ctx.profile, ctx.listing),
    );
    const coverLetter = await step.run("cover-letter", () =>
      draftCoverLetter(ctx.profile, ctx.listing),
    );

    // Render + upload the tailored PDF (service role bypasses storage RLS;
    // path is namespaced by user id so per-user access still holds for reads).
    const resumeFileId = await step.run("render-upload-pdf", async () => {
      const pdf = await renderResumePdf(tailored);
      const path = `${userId}/tailored-${matchId}-${Date.now()}.pdf`;
      const { error: upErr } = await db.storage
        .from("resumes")
        .upload(path, pdf, { contentType: "application/pdf", upsert: true });
      if (upErr) throw new Error(`PDF upload failed: ${upErr.message}`);

      const { data, error } = await db
        .from("resume_files")
        .insert({
          user_id: userId,
          storage_path: path,
          kind: "tailored",
          filename: `${ctx.listing.company}-${ctx.listing.title}.pdf`,
        })
        .select("id")
        .single();
      if (error) throw new Error(`resume_files insert failed: ${error.message}`);
      return data.id as string;
    });

    // Create the application + approval card, and mark the match ready.
    const ids = await step.run("create-application", async () => {
      const { data: app, error: appErr } = await db
        .from("applications")
        .insert({
          user_id: userId,
          match_id: matchId,
          tailored_resume_file_id: resumeFileId,
          cover_letter: coverLetter,
          status: "awaiting_approval",
        })
        .select("id")
        .single();
      if (appErr) throw new Error(`application insert failed: ${appErr.message}`);

      const { data: approval, error: apprErr } = await db
        .from("approvals")
        .insert({
          user_id: userId,
          application_id: app.id,
          type: "apply",
          payload: {
            jobTitle: ctx.listing.title,
            company: ctx.listing.company,
            location: ctx.listing.location,
            applyUrl: ctx.listing.applyUrl,
            applyMethod: ctx.listing.applyMethod,
            score: ctx.score,
            coverLetterPreview: coverLetter.slice(0, 280),
          },
        })
        .select("id")
        .single();
      if (apprErr) throw new Error(`approval insert failed: ${apprErr.message}`);

      await db
        .from("job_matches")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .eq("id", matchId)
        .eq("user_id", userId);

      await db.from("activity_events").insert({
        user_id: userId,
        mission_id: ctx.missionId,
        kind: "application_ready",
        message: `Tailored an application for ${ctx.listing.title} at ${ctx.listing.company} — ready for your review`,
        metadata: { applicationId: app.id },
      });

      return { applicationId: app.id as string, approvalId: approval.id as string };
    });

    await step.sendEvent("application-ready", {
      name: "application/ready",
      data: { ...ids, userId },
    });

    return ids;
  },
);
