"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type ApprovalCardProps = {
  id: string;
  title: string;
  subtitle: string;
} & (
  | {
      type: "apply";
      score?: number | null;
      applyUrl?: string;
      coverLetter?: string;
      resumeUrl?: string | null;
    }
  | {
      type: "follow_up";
      emailSubject: string;
      emailBody: string;
      recipient: string | null;
    }
  | {
      type: "interview_proposal";
      recipient: string | null;
      slots: string[];
    }
);

export default function ApprovalCard(props: ApprovalCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "approved" | "rejected">(null);
  const [expanded, setExpanded] = useState(false);
  const [slot, setSlot] = useState<string>(
    props.type === "interview_proposal" ? (props.slots[0] ?? "") : "",
  );
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    if (
      decision === "approved" &&
      props.type === "interview_proposal" &&
      !slot
    ) {
      setError("Pick a time first.");
      return;
    }
    setBusy(decision);
    setError(null);
    const res = await fetch(`/api/approvals/${props.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        selectedSlot:
          props.type === "interview_proposal" && decision === "approved"
            ? slot
            : undefined,
      }),
    });
    if (!res.ok) {
      setBusy(null);
      const { error } = await res.json().catch(() => ({ error: "failed" }));
      setError(error);
      return;
    }
    router.refresh();
  }

  const badge =
    props.type === "apply"
      ? "Apply"
      : props.type === "follow_up"
        ? "Follow-up"
        : "Interview";

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            {badge}
          </span>
          <h3 className="text-lg font-semibold">{props.title}</h3>
          {props.subtitle && <p className="text-neutral-600">{props.subtitle}</p>}
        </div>
        {props.type === "apply" && props.score != null && (
          <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
            {props.score}/100 fit
          </span>
        )}
      </div>

      {props.type === "apply" && (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            {props.resumeUrl && (
              <a href={props.resumeUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                Tailored resume (PDF)
              </a>
            )}
            {props.applyUrl && (
              <a href={props.applyUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                Job posting
              </a>
            )}
            <button onClick={() => setExpanded((s) => !s)} className="text-neutral-600 underline">
              {expanded ? "Hide" : "Read"} cover letter
            </button>
          </div>
          {expanded && (
            <pre className="whitespace-pre-wrap rounded-lg bg-neutral-50 p-4 text-sm text-neutral-800">
              {props.coverLetter}
            </pre>
          )}
        </>
      )}

      {props.type === "follow_up" && (
        <div className="rounded-lg bg-neutral-50 p-4 text-sm">
          <p className="text-neutral-500">
            To: {props.recipient ?? "(no recruiter email — you'll send manually)"}
          </p>
          <p className="font-medium">{props.emailSubject}</p>
          <pre className="mt-1 whitespace-pre-wrap text-neutral-800">
            {props.emailBody}
          </pre>
        </div>
      )}

      {props.type === "interview_proposal" && (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-neutral-600">Pick a time to propose:</p>
          {props.slots.length === 0 ? (
            <p className="text-neutral-500">No open slots found.</p>
          ) : (
            props.slots.map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`slot-${props.id}`}
                  checked={slot === s}
                  onChange={() => setSlot(s)}
                />
                {new Date(s).toLocaleString()}
              </label>
            ))
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => decide("approved")}
          disabled={busy !== null}
          className="rounded-lg bg-black px-5 py-2 font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {busy === "approved"
            ? "Working…"
            : props.type === "apply"
              ? "Approve & apply"
              : props.type === "follow_up"
                ? "Send follow-up"
                : "Confirm time"}
        </button>
        <button
          onClick={() => decide("rejected")}
          disabled={busy !== null}
          className="rounded-lg border border-neutral-300 px-5 py-2 font-medium hover:bg-neutral-50 disabled:opacity-50"
        >
          {busy === "rejected" ? "Skipping…" : "Skip"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </article>
  );
}
