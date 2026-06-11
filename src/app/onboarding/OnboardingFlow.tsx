"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Three-step onboarding: upload resume → state goal → go.
 * (Connecting Gmail/Calendar arrives in Phases 5–6; surfaced as a later step.)
 */
export default function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [resumeName, setResumeName] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadResume(file: File) {
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set("resume", file);
    const res = await fetch("/api/profile/resume", { method: "POST", body });
    setBusy(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "upload failed" }));
      setError(error);
      return;
    }
    setResumeName(file.name);
    setStep(2);
  }

  async function launch() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal }),
    });
    setBusy(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "could not start" }));
      setError(error);
      return;
    }
    router.push("/inbox");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 px-6">
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <span className={step === 1 ? "font-semibold text-black" : ""}>
          1. Resume
        </span>
        <span>→</span>
        <span className={step === 2 ? "font-semibold text-black" : ""}>
          2. Goal
        </span>
      </div>

      {step === 1 && (
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold">Upload your resume</h1>
          <p className="text-neutral-600">
            We&apos;ll read it once to build your profile. PDF or text.
          </p>
          <input
            type="file"
            accept=".pdf,.txt,.md,text/plain,application/pdf"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadResume(f);
            }}
            className="rounded-lg border border-neutral-300 px-4 py-3"
          />
          {busy && <p className="text-neutral-500">Reading your resume…</p>}
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold">What&apos;s the goal?</h1>
          {resumeName && (
            <p className="text-sm text-green-700">✓ {resumeName} processed</p>
          )}
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
            placeholder="Get me a remote ML job, $150k+, US-friendly timezone"
            className="rounded-lg border border-neutral-300 px-4 py-3"
          />
          <button
            onClick={launch}
            disabled={busy || goal.trim().length < 5}
            className="rounded-lg bg-black px-5 py-3 font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {busy ? "Starting…" : "Run the mission"}
          </button>
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
