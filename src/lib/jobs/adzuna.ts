import { env } from "../env";
import { JobListing, MissionPreferences } from "../types";
import { looksRemote } from "./util";

/**
 * Adzuna job search — the primary keyword/location search source.
 * Docs: https://developer.adzuna.com/  (free tier: app_id + app_key)
 */
interface AdzunaResult {
  id: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  description: string;
  redirect_url: string;
  salary_min?: number;
  salary_max?: number;
  created?: string;
}

const COUNTRY = "us"; // could be derived from preferences.locations

export async function searchAdzuna(
  prefs: MissionPreferences,
): Promise<JobListing[]> {
  const appId = env.adzunaAppId();
  const appKey = env.adzunaAppKey();
  if (!appId || !appKey) return []; // source disabled when unconfigured

  const what = [prefs.role, ...prefs.keywords.slice(0, 3)].join(" ").trim();
  const where = prefs.remote === "remote" ? "" : prefs.locations[0] ?? "";

  const url = new URL(
    `https://api.adzuna.com/v1/api/jobs/${COUNTRY}/search/1`,
  );
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("results_per_page", "30");
  url.searchParams.set("what", what);
  if (where) url.searchParams.set("where", where);
  if (prefs.minCompensation) {
    url.searchParams.set("salary_min", String(prefs.minCompensation));
  }
  if (prefs.remote === "remote") url.searchParams.set("what_or", "remote");

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Adzuna search failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { results?: AdzunaResult[] };

  return (body.results ?? []).map((r) => ({
    source: "adzuna",
    externalId: String(r.id),
    title: r.title,
    company: r.company?.display_name ?? "Unknown",
    location: r.location?.display_name ?? null,
    remote: looksRemote(r.title, r.description, r.location?.display_name),
    compMin: r.salary_min ? Math.round(r.salary_min) : null,
    compMax: r.salary_max ? Math.round(r.salary_max) : null,
    description: r.description,
    applyUrl: r.redirect_url,
    applyMethod: "external_link" as const,
    applyEmail: null,
    postedAt: r.created ?? null,
  }));
}
