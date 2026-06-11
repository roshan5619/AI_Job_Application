# Phase-by-Phase Progress Record

This document tracks the build of the **AI Execution Agent** phase by phase.
Each phase is a shippable milestone and corresponds to one (or more) commits.

Full plan: see the project plan / `README.md`.

| Phase | Title | Status |
|---|---|---|
| 0 | Foundations | ✅ Complete |
| 1 | Profile & Goal | ⏳ Planned |
| 2 | Discovery & Match | ⏳ Planned |
| 3 | Tailor & Package | ⏳ Planned |
| 4 | Review & Apply (first E2E demo) | ⏳ Planned |
| 5 | Follow-up & Inbox | ⏳ Planned |
| 6 | Interview Scheduling | ⏳ Planned |
| 7 | Launch Hardening | ⏳ Planned |

---

## Phase 0 — Foundations ✅

**Goal:** A runnable, type-safe skeleton with the database, the Claude
integration layer, auth, and the durable-workflow engine all wired.

**Delivered:**

- **Project scaffold** — Next.js 15 (App Router) + TypeScript + Tailwind;
  `package.json`, `tsconfig.json`, `next.config.mjs`, PostCSS/Tailwind config,
  `.env.example`, `.gitignore`. Landing page + root layout.
- **Database** — `supabase/migrations/0001_init.sql`: tables for
  `candidate_profiles`, `resume_files`, `missions`, `job_listings`,
  `job_matches`, `applications`, `approvals`, `communications`, `interviews`,
  `integrations`, `activity_events`. `0002_rls.sql`: Row-Level Security so each
  user can only access their own rows; shared `job_listings` readable by all
  authenticated users.
- **Claude wrapper** (`src/lib/anthropic.ts`) — single client with model
  routing (`claude-opus-4-8` for tailoring/cover letters, `claude-haiku-4-5`
  for parse/score/triage), prompt caching of the candidate profile in
  `scoreJob`, and typed functions: `parseResume`, `parseGoal`, `scoreJob`,
  `tailorResume`, `draftCoverLetter`, `triageReply`. Zod schemas in
  `src/lib/types.ts` drive structured output + validation.
- **Supabase clients** — `server.ts` (RLS, cookie-bound), `client.ts`
  (browser), `admin.ts` (service role for workers). Auth session refresh in
  `src/middleware.ts`.
- **Encrypted integrations store** — `src/lib/crypto.ts` (AES-256-GCM) +
  `src/lib/integrations.ts` to persist Google OAuth tokens encrypted at rest.
- **Inngest** — typed client (`src/inngest/client.ts`) with the workflow event
  schema (including the `application/approval.resolved` human-in-the-loop
  event), function registry, and the `/api/inngest` serve route.

**Key design choices:** the agent is a durable Inngest workflow, not a chat
loop; every outward action pauses for human approval via `waitForEvent`;
tailoring is truthful-by-construction (prompt forbids fabrication); tokens and
resumes are treated as sensitive PII (encryption + RLS).

**Next:** Phase 1 — resume upload + parse and goal parsing wired into an
onboarding flow.
