import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import ApprovalCard from "./ApprovalCard";

type ApprovalPayload = {
  jobTitle?: string;
  company?: string;
  location?: string | null;
  applyUrl?: string;
  score?: number | null;
};

/**
 * Approval Inbox — the primary surface. Shows pending "apply" cards with the
 * job, score, cover letter, and tailored resume; the user approves or skips.
 * Below the inbox, a read-only activity feed of what the agent has done.
 */
export default async function InboxPage() {
  await requireUser();
  const supabase = await supabaseServer();

  const { data: approvals } = await supabase
    .from("approvals")
    .select("id, payload, application_id, created_at")
    .is("decision", null)
    .eq("type", "apply")
    .order("created_at", { ascending: false });

  // Enrich each card with the full cover letter and a signed resume URL.
  const cards = await Promise.all(
    (approvals ?? []).map(async (a) => {
      const payload = (a.payload ?? {}) as ApprovalPayload;
      const { data: app } = await supabase
        .from("applications")
        .select("cover_letter, tailored_resume_file_id")
        .eq("id", a.application_id)
        .single();

      let resumeUrl: string | null = null;
      if (app?.tailored_resume_file_id) {
        const { data: file } = await supabase
          .from("resume_files")
          .select("storage_path")
          .eq("id", app.tailored_resume_file_id)
          .single();
        if (file?.storage_path) {
          const { data: signed } = await supabase.storage
            .from("resumes")
            .createSignedUrl(file.storage_path, 60 * 30);
          resumeUrl = signed?.signedUrl ?? null;
        }
      }

      return {
        id: a.id,
        jobTitle: payload.jobTitle ?? "Role",
        company: payload.company ?? "",
        location: payload.location ?? null,
        score: payload.score ?? null,
        applyUrl: payload.applyUrl ?? "",
        coverLetter: app?.cover_letter ?? "",
        resumeUrl,
      };
    }),
  );

  const { data: events } = await supabase
    .from("activity_events")
    .select("kind, message, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Approval inbox</h1>
        <p className="text-neutral-600">
          Each card is a ready-to-send application. Approve it and the agent
          submits; skip it and the agent moves on.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        {cards.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-8 text-center text-neutral-500">
            Nothing to review yet — the agent is finding and tailoring roles.
          </p>
        ) : (
          cards.map((c) => <ApprovalCard key={c.id} {...c} />)
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Activity
        </h2>
        {events && events.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {events.map((e, i) => (
              <li
                key={i}
                className="rounded-lg border border-neutral-200 px-4 py-3 text-sm"
              >
                <span className="text-neutral-800">{e.message}</span>
                <span className="ml-2 text-xs text-neutral-400">
                  {new Date(e.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-neutral-500">No activity yet.</p>
        )}
      </section>
    </main>
  );
}
