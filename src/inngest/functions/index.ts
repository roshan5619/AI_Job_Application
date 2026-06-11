import type { InngestFunction } from "inngest";

/**
 * Registry of all Inngest functions, served at /api/inngest. Functions are
 * added here as each phase lands (discover, score, tailor, await-approval,
 * submit, follow-up, triage, schedule).
 */
export const functions: InngestFunction.Any[] = [];
