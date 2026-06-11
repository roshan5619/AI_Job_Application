import { z } from "zod";

/**
 * Domain types shared across the app, the Inngest workflows, and the Claude
 * wrapper. Zod schemas double as runtime validators for Claude structured
 * output and as the source of inferred TypeScript types.
 */

// ---- Candidate profile (parsed resume) ----
export const ExperienceSchema = z.object({
  company: z.string(),
  title: z.string(),
  startDate: z.string().describe("ISO-ish date or 'YYYY-MM' or year"),
  endDate: z.string().describe("ISO-ish date, year, or 'present'"),
  highlights: z.array(z.string()).describe("Bullet-point accomplishments"),
});

export const EducationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  field: z.string().optional(),
  year: z.string().optional(),
});

export const CandidateProfileSchema = z.object({
  fullName: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  summary: z.string().describe("2-3 sentence professional summary"),
  skills: z.array(z.string()),
  experience: z.array(ExperienceSchema),
  education: z.array(EducationSchema),
  links: z.array(z.string()).describe("Portfolio / GitHub / LinkedIn URLs"),
});
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;

// ---- Mission preferences (parsed goal) ----
export const MissionPreferencesSchema = z.object({
  role: z.string().describe("Target role, e.g. 'Machine Learning Engineer'"),
  seniority: z
    .enum(["intern", "junior", "mid", "senior", "staff", "lead", "any"])
    .describe("Inferred seniority level"),
  remote: z
    .enum(["remote", "hybrid", "onsite", "any"])
    .describe("Work arrangement preference"),
  locations: z.array(z.string()).describe("Acceptable locations / regions"),
  minCompensation: z
    .number()
    .nullable()
    .describe("Minimum annual comp in USD, or null if unspecified"),
  keywords: z.array(z.string()).describe("Skills/technologies to match on"),
  mustHaves: z.array(z.string()).describe("Hard requirements from the goal"),
  dealBreakers: z.array(z.string()).describe("Things to avoid"),
});
export type MissionPreferences = z.infer<typeof MissionPreferencesSchema>;

// ---- Normalized job listing (from any source connector) ----
export type ApplyMethod = "ats_api" | "email" | "external_link";

export interface JobListing {
  source: string; // e.g. "adzuna", "greenhouse", "lever"
  externalId: string; // stable id within the source
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  compMin: number | null;
  compMax: number | null;
  description: string;
  applyUrl: string;
  applyMethod: ApplyMethod;
  applyEmail: string | null;
  postedAt: string | null;
}

// ---- Job match scoring (Claude output) ----
export const JobScoreSchema = z.object({
  score: z.number().describe("Fit score 0-100"),
  rationale: z.string().describe("1-2 sentences explaining the score"),
  matchedKeywords: z.array(z.string()),
  concerns: z.array(z.string()).describe("Gaps or misalignments"),
});
export type JobScore = z.infer<typeof JobScoreSchema>;

// ---- Reply triage (Claude output) ----
export const ReplyTriageSchema = z.object({
  intent: z.enum([
    "interview_request",
    "rejection",
    "info_request",
    "offer",
    "other",
  ]),
  summary: z.string(),
  suggestedAction: z.string(),
});
export type ReplyTriage = z.infer<typeof ReplyTriageSchema>;
