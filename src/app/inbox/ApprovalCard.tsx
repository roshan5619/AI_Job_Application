"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  id: string;
  jobTitle: string;
  company: string;
  location: string | null;
  score: number | null;
  applyUrl: string;
  coverLetter: string;
  resumeUrl: string | null;
}

export default function ApprovalCard(props: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "approved" | "rejected">(null);
  const [showLetter, setShowLetter] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setBusy(decision);
    setError(null);
    const res = await fetch(`/api/approvals/${props.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    if (!res.ok) {
      setBusy(null);
      const { error } = await res.json().catch(() => ({ error: "failed" }));
      setError(error);
      return;
    }
    router.refresh();
  }

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{props.jobTitle}</h3>
          <p className="text-neutral-600">
            {props.company}
            {props.location ? ` · ${props.location}` : ""}
          </p>
        </div>
        {props.score != null && (
          <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
            {props.score}/100 fit
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        {props.resumeUrl && (
          <a
            href={props.resumeUrl}
            target="_blank"
            rel="noreferrer"
            className="text-blue-700 underline"
          >
            View tailored resume (PDF)
          </a>
        )}
        {props.applyUrl && (
          <a
            href={props.applyUrl}
            target="_blank"
            rel="noreferrer"
            className="text-blue-700 underline"
          >
            View job posting
          </a>
        )}
        <button
          onClick={() => setShowLetter((s) => !s)}
          className="text-neutral-600 underline"
        >
          {showLetter ? "Hide" : "Read"} cover letter
        </button>
      </div>

      {showLetter && (
        <pre className="whitespace-pre-wrap rounded-lg bg-neutral-50 p-4 text-sm text-neutral-800">
          {props.coverLetter}
        </pre>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => decide("approved")}
          disabled={busy !== null}
          className="rounded-lg bg-black px-5 py-2 font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {busy === "approved" ? "Submitting…" : "Approve & apply"}
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
