/** Plan definitions and the quotas they grant. */

export type PlanId = "free" | "pro";

export interface Plan {
  id: PlanId;
  name: string;
  maxActiveMissions: number;
  maxApplicationsPerMonth: number;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    maxActiveMissions: 1,
    maxApplicationsPerMonth: 10,
  },
  pro: {
    id: "pro",
    name: "Pro",
    maxActiveMissions: 5,
    maxApplicationsPerMonth: 300,
  },
};

export function planFor(id: string | null | undefined): Plan {
  return PLANS[(id as PlanId) ?? "free"] ?? PLANS.free;
}
