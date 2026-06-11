import { parseGoal } from "@/lib/anthropic";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { inngest } from "../client";

/**
 * mission/created → parse the free-text goal into structured preferences,
 * activate the mission, log activity, and kick off discovery.
 */
export const parseMission = inngest.createFunction(
  { id: "parse-mission", retries: 3 },
  { event: "mission/created" },
  async ({ event, step }) => {
    const { missionId, userId } = event.data;
    const db = supabaseAdmin();

    const rawGoal = await step.run("load-goal", async () => {
      const { data, error } = await db
        .from("missions")
        .select("raw_goal")
        .eq("id", missionId)
        .eq("user_id", userId)
        .single();
      if (error) throw new Error(`Mission not found: ${error.message}`);
      return data.raw_goal as string;
    });

    const preferences = await step.run("parse-goal", () => parseGoal(rawGoal));

    await step.run("save-preferences", async () => {
      const { error } = await db
        .from("missions")
        .update({
          preferences,
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", missionId)
        .eq("user_id", userId);
      if (error) throw new Error(`Failed to save preferences: ${error.message}`);

      await db.from("activity_events").insert({
        user_id: userId,
        mission_id: missionId,
        kind: "mission_parsed",
        message: `Understood your goal: ${preferences.role} (${preferences.remote})`,
        metadata: { preferences },
      });
    });

    // Hand off to discovery (Phase 2 consumes this event).
    await step.sendEvent("start-discovery", {
      name: "mission/discover.requested",
      data: { missionId, userId },
    });

    return { missionId, preferences };
  },
);
