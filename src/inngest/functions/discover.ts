import { discoverJobs } from "@/lib/jobs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MissionPreferences } from "@/lib/types";
import { inngest } from "../client";

/**
 * mission/discover.requested → query all job sources, upsert listings, create
 * match rows for new (mission, job) pairs, and fan out a scoring event per new
 * match. Also runs on a schedule for active missions via the cron sibling.
 */
export const discover = inngest.createFunction(
  { id: "discover", retries: 2 },
  { event: "mission/discover.requested" },
  async ({ event, step }) => {
    const { missionId, userId } = event.data;
    const db = supabaseAdmin();

    const prefs = await step.run("load-preferences", async () => {
      const { data, error } = await db
        .from("missions")
        .select("preferences, is_active")
        .eq("id", missionId)
        .eq("user_id", userId)
        .single();
      if (error) throw new Error(`Mission not found: ${error.message}`);
      if (!data.is_active || !data.preferences) return null;
      return data.preferences as MissionPreferences;
    });
    if (!prefs) return { skipped: "mission inactive or unparsed" };

    const listings = await step.run("search-sources", () =>
      discoverJobs(prefs),
    );
    if (listings.length === 0) return { found: 0 };

    // Upsert shared listings; get back their ids keyed by (source, externalId).
    const jobIdByKey = await step.run("upsert-listings", async () => {
      const rows = listings.map((j) => ({
        source: j.source,
        external_id: j.externalId,
        title: j.title,
        company: j.company,
        location: j.location,
        remote: j.remote,
        comp_min: j.compMin,
        comp_max: j.compMax,
        description: j.description,
        apply_url: j.applyUrl,
        apply_method: j.applyMethod,
        apply_email: j.applyEmail,
        posted_at: j.postedAt,
      }));
      const { data, error } = await db
        .from("job_listings")
        .upsert(rows, { onConflict: "source,external_id" })
        .select("id, source, external_id");
      if (error) throw new Error(`Listing upsert failed: ${error.message}`);
      const map: Record<string, string> = {};
      for (const r of data ?? []) map[`${r.source}:${r.external_id}`] = r.id;
      return map;
    });

    // Create new matches only; ignoreDuplicates so re-runs don't re-score.
    const newMatchIds = await step.run("create-matches", async () => {
      const matchRows = Object.values(jobIdByKey).map((jobId) => ({
        user_id: userId,
        mission_id: missionId,
        job_id: jobId,
        status: "new",
      }));
      const { data, error } = await db
        .from("job_matches")
        .upsert(matchRows, {
          onConflict: "mission_id,job_id",
          ignoreDuplicates: true,
        })
        .select("id");
      if (error) throw new Error(`Match insert failed: ${error.message}`);
      return (data ?? []).map((m) => m.id as string);
    });

    await step.run("log-activity", async () => {
      await db.from("activity_events").insert({
        user_id: userId,
        mission_id: missionId,
        kind: "jobs_discovered",
        message: `Found ${newMatchIds.length} new role${newMatchIds.length === 1 ? "" : "s"} to evaluate`,
        metadata: { total: listings.length, new: newMatchIds.length },
      });
    });

    // Fan out scoring (one event per new match).
    if (newMatchIds.length > 0) {
      await step.sendEvent(
        "fan-out-scoring",
        newMatchIds.map((matchId) => ({
          name: "match/score.requested" as const,
          data: { matchId, userId },
        })),
      );
    }

    return { found: listings.length, newMatches: newMatchIds.length };
  },
);

/**
 * Every 6h: re-run discovery for all active missions so fresh postings flow in.
 */
export const scheduledDiscovery = inngest.createFunction(
  { id: "scheduled-discovery" },
  { cron: "0 */6 * * *" },
  async ({ step }) => {
    const db = supabaseAdmin();
    const missions = await step.run("load-active-missions", async () => {
      const { data, error } = await db
        .from("missions")
        .select("id, user_id")
        .eq("is_active", true)
        .eq("status", "active");
      if (error) throw new Error(`Failed to load missions: ${error.message}`);
      return data ?? [];
    });

    if (missions.length > 0) {
      await step.sendEvent(
        "rediscover",
        missions.map((m) => ({
          name: "mission/discover.requested" as const,
          data: { missionId: m.id as string, userId: m.user_id as string },
        })),
      );
    }
    return { missions: missions.length };
  },
);
