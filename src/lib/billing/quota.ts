import { supabaseAdmin } from "../supabase/admin";
import { Plan, planFor } from "./plans";

/** Resolve a user's current plan (defaults to free if no subscription row). */
export async function getPlan(userId: string): Promise<Plan> {
  const { data } = await supabaseAdmin()
    .from("subscriptions")
    .select("plan, status")
    .eq("user_id", userId)
    .maybeSingle();
  // Lapsed subscriptions fall back to free limits.
  if (!data || data.status === "canceled" || data.status === "past_due") {
    return planFor("free");
  }
  return planFor(data.plan);
}

export interface QuotaCheck {
  ok: boolean;
  used: number;
  limit: number;
  plan: string;
}

/** Can the user start another mission? */
export async function checkMissionQuota(userId: string): Promise<QuotaCheck> {
  const plan = await getPlan(userId);
  const { count } = await supabaseAdmin()
    .from("missions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_active", true);
  const used = count ?? 0;
  return {
    ok: used < plan.maxActiveMissions,
    used,
    limit: plan.maxActiveMissions,
    plan: plan.id,
  };
}

/** Can the user submit another application this calendar month? */
export async function checkApplicationQuota(
  userId: string,
): Promise<QuotaCheck> {
  const plan = await getPlan(userId);
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const { count } = await supabaseAdmin()
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "submitted")
    .gte("submitted_at", startOfMonth.toISOString());
  const used = count ?? 0;
  return {
    ok: used < plan.maxApplicationsPerMonth,
    used,
    limit: plan.maxApplicationsPerMonth,
    plan: plan.id,
  };
}
