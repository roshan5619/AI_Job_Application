import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "./env";
import {
  CandidateProfile,
  CandidateProfileSchema,
  JobListing,
  JobScore,
  JobScoreSchema,
  MissionPreferences,
  MissionPreferencesSchema,
  ReplyTriage,
  ReplyTriageSchema,
} from "./types";

/**
 * Single Claude client + typed task functions for the whole app.
 *
 * Model routing:
 *   - OPUS  (claude-opus-4-8)  → quality-critical generation (tailoring, cover letters)
 *   - HAIKU (claude-haiku-4-5) → high-volume, cheap structured work (parse, score, triage)
 *
 * Prompt caching: scoreJob() caches the candidate profile prefix so scoring
 * many jobs for one candidate only pays full input price once. Verify via
 * usage.cache_read_input_tokens > 0 on the 2nd+ call.
 */

const MODEL = {
  OPUS: "claude-opus-4-8",
  HAIKU: "claude-haiku-4-5",
} as const;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.anthropicApiKey() });
  return _client;
}

/** Parse <= helper: messages.parse with a Zod schema, returns validated output. */
async function parseStructured<T>(args: {
  model: string;
  schema: z.ZodType<T>;
  system: Anthropic.MessageParam["content"] | string;
  user: string;
  maxTokens?: number;
}): Promise<T> {
  const response = await client().messages.parse({
    model: args.model,
    max_tokens: args.maxTokens ?? 8000,
    system: args.system as Anthropic.MessageCreateParams["system"],
    messages: [{ role: "user", content: args.user }],
    output_config: { format: zodOutputFormat(args.schema as z.ZodType) },
  });
  if (!response.parsed_output) {
    throw new Error(`Claude returned no parseable output (model=${args.model})`);
  }
  return response.parsed_output as T;
}

// ---------------------------------------------------------------------------
// Resume parsing: raw extracted text -> structured CandidateProfile
// ---------------------------------------------------------------------------
export async function parseResume(resumeText: string): Promise<CandidateProfile> {
  return parseStructured({
    model: MODEL.HAIKU,
    schema: CandidateProfileSchema,
    system:
      "You extract structured data from resumes. Use only information present " +
      "in the resume text. Never invent experience, skills, or dates. If a " +
      "field is absent, omit it or leave it empty.",
    user: `Extract the candidate profile from this resume:\n\n${resumeText}`,
  });
}

// ---------------------------------------------------------------------------
// Goal parsing: free-text goal -> structured MissionPreferences
// ---------------------------------------------------------------------------
export async function parseGoal(rawGoal: string): Promise<MissionPreferences> {
  return parseStructured({
    model: MODEL.HAIKU,
    schema: MissionPreferencesSchema,
    system:
      "You convert a job-seeker's plain-language goal into structured search " +
      "preferences. Infer reasonable defaults (e.g. seniority from phrasing) " +
      "but do not fabricate hard requirements the user did not state.",
    user: `Job-search goal: "${rawGoal}"`,
    maxTokens: 2000,
  });
}

// ---------------------------------------------------------------------------
// Job scoring: candidate profile (cached) + one job -> JobScore
// ---------------------------------------------------------------------------
export async function scoreJob(
  profile: CandidateProfile,
  preferences: MissionPreferences,
  job: JobListing,
): Promise<JobScore> {
  // Stable, cacheable prefix: the candidate profile + preferences. Identical
  // across every job scored for this mission, so it caches after the 1st call.
  const cachedContext: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text:
        "You score how well a job fits a specific candidate, 0-100. Be " +
        "calibrated: 80+ means a strong, realistic fit; below 40 means a poor " +
        "fit. Consider skills overlap, seniority, location/remote, and comp.\n\n" +
        "CANDIDATE PROFILE:\n" +
        JSON.stringify(profile) +
        "\n\nSEARCH PREFERENCES:\n" +
        JSON.stringify(preferences),
      cache_control: { type: "ephemeral" },
    },
  ];

  return parseStructured({
    model: MODEL.HAIKU,
    schema: JobScoreSchema,
    system: cachedContext,
    user:
      `Score this job:\n\nTitle: ${job.title}\nCompany: ${job.company}\n` +
      `Location: ${job.location ?? "n/a"} (remote: ${job.remote})\n` +
      `Comp: ${job.compMin ?? "?"}-${job.compMax ?? "?"}\n\n` +
      `Description:\n${job.description}`,
    maxTokens: 1500,
  });
}

// ---------------------------------------------------------------------------
// Resume tailoring: profile + job -> tailored CandidateProfile (truthful)
// ---------------------------------------------------------------------------
export async function tailorResume(
  profile: CandidateProfile,
  job: JobListing,
): Promise<CandidateProfile> {
  return parseStructured({
    model: MODEL.OPUS,
    schema: CandidateProfileSchema,
    system:
      "You tailor a resume to a specific job. CRITICAL TRUTHFULNESS RULE: you " +
      "may reorder, reword, and re-emphasize the candidate's REAL experience " +
      "and skills to highlight relevance to the job. You must NEVER invent " +
      "employers, titles, dates, degrees, or accomplishments that are not in " +
      "the source profile. Rewrite highlights to surface job-relevant impact " +
      "using strong, specific language drawn only from what is already there.",
    user:
      `Tailor this candidate's resume for the following job.\n\n` +
      `JOB:\nTitle: ${job.title}\nCompany: ${job.company}\n` +
      `Description:\n${job.description}\n\n` +
      `SOURCE PROFILE (do not fabricate beyond this):\n${JSON.stringify(profile)}`,
    maxTokens: 8000,
  });
}

// ---------------------------------------------------------------------------
// Cover letter: profile + job -> plain-text cover letter
// ---------------------------------------------------------------------------
export async function draftCoverLetter(
  profile: CandidateProfile,
  job: JobListing,
): Promise<string> {
  const response = await client().messages.create({
    model: MODEL.OPUS,
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system:
      "You write concise, specific, genuine cover letters (under 300 words). " +
      "Ground every claim in the candidate's real profile — never fabricate. " +
      "No clichés, no 'I am writing to express my interest'. Open with a real " +
      "hook tied to the role.",
    messages: [
      {
        role: "user",
        content:
          `Write a cover letter for this candidate applying to this job.\n\n` +
          `JOB:\nTitle: ${job.title}\nCompany: ${job.company}\n` +
          `Description:\n${job.description}\n\n` +
          `CANDIDATE:\n${JSON.stringify(profile)}`,
      },
    ],
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Follow-up email draft (subject + body)
// ---------------------------------------------------------------------------
const FollowUpSchema = z.object({
  subject: z.string(),
  body: z.string().describe("Plain-text email body, under 120 words"),
});
export type FollowUp = z.infer<typeof FollowUpSchema>;

export async function draftFollowUp(
  candidateName: string,
  jobTitle: string,
  company: string,
): Promise<FollowUp> {
  return parseStructured({
    model: MODEL.HAIKU,
    schema: FollowUpSchema,
    system:
      "You write short, polite, non-pushy follow-up emails after a job " +
      "application. Reaffirm interest and value in one or two sentences. No " +
      "clichés. Sign off with the candidate's name.",
    user: `Candidate: ${candidateName}\nApplied for: ${jobTitle} at ${company}`,
    maxTokens: 800,
  });
}

// ---------------------------------------------------------------------------
// Reply triage: classify an inbound recruiter email
// ---------------------------------------------------------------------------
export async function triageReply(
  subject: string,
  body: string,
): Promise<ReplyTriage> {
  return parseStructured({
    model: MODEL.HAIKU,
    schema: ReplyTriageSchema,
    system:
      "You classify recruiter/hiring email replies and suggest the next action " +
      "for an automated job-application assistant.",
    user: `Subject: ${subject}\n\nBody:\n${body}`,
    maxTokens: 1000,
  });
}
