import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

// Minimal activity view. The full Approval Inbox (cards + approve/edit/skip)
// is built in Phase 4; for now this confirms the workflow is running.
export default async function InboxPage() {
  await requireUser();
  const supabase = await supabaseServer();

  const { data: events } = await supabase
    .from("activity_events")
    .select("kind, message, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-bold">Your agent is on it</h1>
      <p className="text-neutral-600">
        Approval cards will appear here as applications are prepared.
      </p>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Activity
        </h2>
        {events && events.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {events.map((e, i) => (
              <li key={i} className="rounded-lg border border-neutral-200 px-4 py-3">
                <span className="text-neutral-800">{e.message}</span>
                <span className="ml-2 text-xs text-neutral-400">
                  {new Date(e.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-neutral-500">
            Warming up — understanding your goal and searching for roles…
          </p>
        )}
      </section>
    </main>
  );
}
