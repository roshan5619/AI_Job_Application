import { EventSchemas, Inngest } from "inngest";

/**
 * Typed Inngest client. Events drive the durable job-hunt workflow; the
 * human-in-the-loop pause is implemented with step.waitForEvent on the
 * `application/approval.resolved` event emitted by the Approval Inbox UI.
 */
type Events = {
  "mission/created": { data: { missionId: string; userId: string } };
  "mission/discover.requested": { data: { missionId: string; userId: string } };
  "match/score.requested": { data: { matchId: string; userId: string } };
  "match/tailor.requested": { data: { matchId: string; userId: string } };
  // Emitted when an application is prepared and an approval card is created.
  "application/ready": {
    data: { applicationId: string; approvalId: string; userId: string };
  };
  // Emitted by the UI when the user decides on an approval card.
  "application/approval.resolved": {
    data: {
      approvalId: string;
      applicationId: string;
      decision: "approved" | "rejected" | "edited";
    };
  };
  // Scheduled after an approved application is submitted (Phase 5 follow-up).
  "application/follow-up.scheduled": {
    data: { applicationId: string; userId: string };
  };
  "comms/reply.received": {
    data: { userId: string; gmailThreadId: string; messageId: string };
  };
};

export const inngest = new Inngest({
  id: "ai-execution-agent",
  schemas: new EventSchemas().fromRecord<Events>(),
});
