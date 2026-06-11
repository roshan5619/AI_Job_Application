import { JobListing, MissionPreferences } from "../types";
import { htmlToText, looksRemote, matchesKeywords } from "./util";

/**
 * Lever public postings API. Like Greenhouse, it's per-company (by slug), not
 * a global search. We fetch a curated set and keyword-filter client-side.
 * Endpoint: https://api.lever.co/v0/postings/{company}?mode=json
 */
interface LeverPosting {
  id: string;
  text: string; // title
  descriptionPlain?: string;
  description?: string; // HTML
  categories?: { location?: string; commitment?: string; team?: string };
  hostedUrl: string;
  createdAt?: number;
}

const DEFAULT_COMPANIES = ["netflix", "spotify", "plaid", "ramp"];

export async function searchLever(
  prefs: MissionPreferences,
  companies: string[] = DEFAULT_COMPANIES,
): Promise<JobListing[]> {
  const all = await Promise.allSettled(
    companies.map((c) => fetchCompany(c, prefs)),
  );
  return all.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

async function fetchCompany(
  company: string,
  prefs: MissionPreferences,
): Promise<JobListing[]> {
  const res = await fetch(
    `https://api.lever.co/v0/postings/${company}?mode=json`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) return [];
  const postings = (await res.json()) as LeverPosting[];

  return postings
    .map((p): JobListing => {
      const description =
        p.descriptionPlain ?? htmlToText(p.description ?? "");
      const location = p.categories?.location ?? null;
      return {
        source: "lever",
        externalId: `${company}:${p.id}`,
        title: p.text,
        company,
        location,
        remote: looksRemote(p.text, location, p.categories?.commitment, description),
        compMin: null,
        compMax: null,
        description,
        applyUrl: p.hostedUrl,
        applyMethod: "external_link",
        applyEmail: null,
        postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
      };
    })
    .filter((j) =>
      matchesKeywords(`${j.title} ${j.description}`, [
        prefs.role,
        ...prefs.keywords,
      ]),
    );
}
