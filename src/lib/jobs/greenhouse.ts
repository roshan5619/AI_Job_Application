import { JobListing, MissionPreferences } from "../types";
import { htmlToText, looksRemote, matchesKeywords } from "./util";

/**
 * Greenhouse public job-board API. There is no global search — each company
 * exposes its own board by slug. We fetch a curated set of boards and filter
 * client-side by keyword. The slug set can be grown over time / per-mission.
 * Docs: https://developers.greenhouse.io/job-board.html
 */
interface GreenhouseJob {
  id: number;
  title: string;
  location?: { name?: string };
  content: string; // HTML-encoded
  absolute_url: string;
  updated_at?: string;
}

// Seed boards skewed toward ML / software roles. Extend freely.
const DEFAULT_BOARDS = [
  "anthropic",
  "stripe",
  "databricks",
  "figma",
  "discord",
];

export async function searchGreenhouse(
  prefs: MissionPreferences,
  boards: string[] = DEFAULT_BOARDS,
): Promise<JobListing[]> {
  const all = await Promise.allSettled(
    boards.map((b) => fetchBoard(b, prefs)),
  );
  return all.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

async function fetchBoard(
  board: string,
  prefs: MissionPreferences,
): Promise<JobListing[]> {
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) return [];
  const body = (await res.json()) as { jobs?: GreenhouseJob[] };

  return (body.jobs ?? [])
    .map((j): JobListing => {
      const description = htmlToText(j.content ?? "");
      return {
        source: "greenhouse",
        externalId: `${board}:${j.id}`,
        title: j.title,
        company: board,
        location: j.location?.name ?? null,
        remote: looksRemote(j.title, j.location?.name, description),
        compMin: null,
        compMax: null,
        description,
        applyUrl: j.absolute_url,
        applyMethod: "external_link",
        applyEmail: null,
        postedAt: j.updated_at ?? null,
      };
    })
    .filter((j) =>
      matchesKeywords(`${j.title} ${j.description}`, [
        prefs.role,
        ...prefs.keywords,
      ]),
    );
}
