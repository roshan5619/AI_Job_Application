import { JobListing, MissionPreferences } from "../types";
import { searchAdzuna } from "./adzuna";
import { searchGreenhouse } from "./greenhouse";
import { searchLever } from "./lever";

/**
 * Run every configured job source for a mission's preferences and return a
 * de-duplicated list of normalized listings. Sources that fail (or are
 * unconfigured) are skipped without failing the whole discovery run.
 */
export async function discoverJobs(
  prefs: MissionPreferences,
): Promise<JobListing[]> {
  const results = await Promise.allSettled([
    searchAdzuna(prefs),
    searchGreenhouse(prefs),
    searchLever(prefs),
  ]);

  const listings = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : [],
  );

  // Dedupe within this batch by (source, externalId). Cross-batch dedupe is
  // handled by the unique constraint on job_listings at upsert time.
  const seen = new Set<string>();
  const deduped: JobListing[] = [];
  for (const job of listings) {
    const key = `${job.source}:${job.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(job);
  }
  return deduped;
}

export { searchAdzuna, searchGreenhouse, searchLever };
