import type { InngestFunction } from "inngest";
import { awaitApproval } from "./await-approval";
import { discover, scheduledDiscovery } from "./discover";
import { followUp } from "./follow-up";
import { scheduleInterview } from "./interview";
import { parseMission } from "./parse-mission";
import { pollReplies } from "./poll-replies";
import { score } from "./score";
import { tailor } from "./tailor";

/**
 * Registry of all Inngest functions, served at /api/inngest.
 */
export const functions: InngestFunction.Any[] = [
  parseMission,
  discover,
  scheduledDiscovery,
  score,
  tailor,
  awaitApproval,
  followUp,
  pollReplies,
  scheduleInterview,
];
