# Phase-by-Phase Progress Record

This document tracks the build of the **AI Execution Agent** phase by phase.
Each phase is a shippable milestone and corresponds to one (or more) commits.

Full plan: see the project plan / `README.md`.

| Phase | Title | Status |
|---|---|---|
| 0 | Foundations | ✅ Complete |
| 1 | Profile & Goal | ✅ Complete |
| 2 | Discovery & Match | ✅ Complete |
| 3 | Tailor & Package | ✅ Complete |
| 4 | Review & Apply (first E2E demo) | ✅ Complete |
| 5 | Follow-up & Inbox | ✅ Complete (code) |
| 6 | Interview Scheduling | ✅ Complete (code) |
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

---

## Phase 1 — Profile & Goal ✅

**Goal:** A user can sign in, upload a resume (→ structured profile), and state
a goal (→ structured preferences) that kicks off the durable workflow.

**Delivered:**

- **Auth** — magic-link sign-in (`/login`), code-exchange callback
  (`/auth/callback`), and a `requireUser()` server guard for protected pages.
- **Resume extraction** (`src/lib/resume/extract.ts`) — PDF text via `unpdf`,
  plus plain-text handling, behind one interface.
- **API routes**
  - `POST /api/profile/resume` — multipart upload → store original in the
    private `resumes` bucket → extract text → `parseResume` (Claude) → save
    `candidate_profiles`.
  - `POST /api/missions` — create a mission from the goal and emit
    `mission/created`.
- **Workflow** (`src/inngest/functions/parse-mission.ts`) — `mission/created`
  → `parseGoal` (Claude) → save preferences, activate mission, log an activity
  event, and hand off `mission/discover.requested` (consumed in Phase 2).
- **Onboarding UI** (`/onboarding`) — two-step flow (resume → goal → run), then
  redirect to a minimal activity view (`/inbox`, full Approval Inbox in Phase 4).
- **Storage** (`0003_storage.sql`) — private `resumes` bucket with per-user
  folder RLS; `candidate_profiles.user_id` made unique (one profile per user).

**Note:** dependencies are not yet installed in this environment, so a local
`npm run typecheck` / `build` has not been run against Phase 0–1 code.

**Next:** Phase 2 — job-source connectors (Adzuna, Greenhouse/Lever), dedupe,
and cached scoring.

---

## Phase 2 — Discovery & Match ✅

**Goal:** From a mission's preferences, pull real jobs from official APIs,
dedupe them, and score each against the candidate — cheaply and in parallel.

**Delivered:**

- **Job-source connectors** (`src/lib/jobs/`)
  - `adzuna.ts` — primary keyword/location search (free-tier API; skipped when
    unconfigured).
  - `greenhouse.ts` / `lever.ts` — per-company public board APIs over a curated,
    extensible slug set, keyword-filtered client-side.
  - `util.ts` — HTML→text, remote-detection, and a cheap keyword pre-filter.
  - `index.ts` — `discoverJobs()` runs all sources in parallel
    (`Promise.allSettled`, so one failure can't sink the run) and dedupes.
- **Workflows**
  - `discover.ts` — `mission/discover.requested` → search → upsert shared
    `job_listings` (dedup via `unique(source, external_id)`) → create new
    `job_matches` (ignore-duplicates so re-runs don't re-score) → log activity →
    fan out one `match/score.requested` per new match.
  - `scheduledDiscovery` — cron every 6h re-runs discovery for active missions.
  - `score.ts` — `match/score.requested` → `scoreJob` (Claude Haiku, candidate
    profile cached in the prompt prefix) → save score + rationale; matches
    ≥ 70 advance to `tailoring` and emit `match/tailor.requested`, the rest are
    `skipped`. Concurrency-limited to 8.

**Verified:** `tsc --noEmit` clean.

**Next:** Phase 3 — tailor the resume for high-scoring matches, draft a cover
letter, and render a tailored PDF.

---

## Phase 3 — Tailor & Package ✅

**Goal:** For every high-scoring match, produce a truthful, job-specific
application package and queue it for human review.

**Delivered:**

- **PDF renderer** (`src/lib/resume/render.tsx`) — `@react-pdf/renderer`
  one-column resume from a `CandidateProfile`; `renderResumePdf()` returns a
  Buffer for upload.
- **Tailor workflow** (`src/inngest/functions/tailor.ts`) — `match/tailor.requested`:
  1. `tailorResume` (Claude Opus, truthful-by-construction) → tailored profile.
  2. `draftCoverLetter` (Claude Opus, adaptive thinking) → cover letter.
  3. Render tailored PDF → upload to the private `resumes` bucket → `resume_files`.
  4. Create the `applications` row (`awaiting_approval`) + an `approvals` card
     (`type: apply`, with job/score/cover-letter preview).
  5. Mark the match `ready`, log activity, and emit `application/ready`
     (Phase 4 consumes this to wait for the user's decision).
- **Event** — added `application/ready` to the typed Inngest schema.

**Verified:** `tsc --noEmit` clean; `next build` succeeds (react-pdf bundles
server-side via `serverExternalPackages`).

**Next:** Phase 4 — the Approval Inbox UI, the `waitForEvent` approval gate, and
assisted submission. First true end-to-end demo.

---

## Phase 4 — Review & Apply ✅ (first end-to-end path)

**Goal:** A human approves prepared applications; on approval the agent submits.
Nothing leaves the system without an explicit decision.

**Delivered:**

- **Approval gate workflow** (`src/inngest/functions/await-approval.ts`) —
  `application/ready` → `step.waitForEvent("application/approval.resolved")`
  (30-day window, matched by `applicationId`). On **approve**: idempotent submit
  (guards on `submitted_at`), application → `submitted` (assisted), match →
  `applied`, activity logged, and a follow-up is scheduled. On **reject**:
  application + match → `rejected`.
- **Resolve API** (`src/app/api/approvals/[id]/route.ts`) — records the decision
  (RLS-scoped, double-resolution guarded) and emits the resolve event that
  un-pauses the workflow.
- **Approval Inbox** (`src/app/inbox/page.tsx` + `ApprovalCard.tsx`) — pending
  cards with job, fit score, signed tailored-resume PDF link, job posting link,
  expandable cover letter, and **Approve & apply / Skip**. Plus the activity feed.
- **Event** — added `application/follow-up.scheduled` (Phase 5 consumes it).

**This closes the core loop:** mission → discover → score → tailor → **review →
apply**. Verified: `tsc --noEmit` clean; `next build` succeeds.

**Next:** Phase 5 — Gmail OAuth, scheduled follow-up emails (approval-gated),
and inbound-reply triage.

---

## Phase 5 — Follow-up & Inbox ✅ (code-complete)

**Goal:** After applying, the agent can follow up by email and understand
recruiter replies — all through the user's own Gmail, approval-gated.

**Delivered:**

- **Google integration layer** (shared with Phase 6)
  - `lib/google/oauth.ts` — consent URL + OAuth2 client (offline access, Gmail +
    Calendar scopes).
  - `lib/google/client.ts` — per-user authenticated client; auto-refreshes and
    re-persists rotated tokens (encrypted).
  - OAuth routes: `/api/integrations/google/start` + `/callback` (session-based
    attribution; tokens saved encrypted).
  - "Connect Gmail & Calendar" link in the inbox.
- **Gmail** (`lib/google/gmail.ts`) — `sendGmail` (RFC-2822, base64url) and
  `getLatestInbound` (MIME walk for the newest non-`SENT` message in a thread).
- **Follow-up workflow** (`follow-up.ts`) — sleeps 5 days, skips if a reply
  already arrived or the app isn't submitted, drafts a short follow-up (Claude),
  creates a `follow_up` approval, waits for the decision, and on approval sends
  via Gmail (when a recruiter address is known) + logs a `communications` row.
- **Reply triage** (`poll-replies.ts`) — hourly cron scans tracked threads,
  ingests new inbound messages, classifies them (`triageReply`), and on
  `interview_request` emits `interview/schedule.requested`.

---

## Phase 6 — Interview Scheduling ✅ (code-complete)

**Goal:** When a recruiter wants to talk, the agent proposes real open times and
books the interview once the user confirms.

**Delivered:**

- **Calendar** (`lib/google/calendar.ts`) — `getBusy` (free/busy), `createEvent`
  (with attendee invite), and `proposeSlots` (weekday business-hour slots that
  avoid busy intervals).
- **Interview workflow** (`interview.ts`) — `interview/schedule.requested` →
  read calendar → propose 3 slots → create an `interview` row + an
  `interview_proposal` approval → wait for the user to pick a slot → book the
  event and reply to the recruiter in-thread with the confirmed time.
- **Approval UI** — `ApprovalCard` now handles all three types (apply /
  follow-up / interview), including a radio slot-picker for interviews; the
  resolve API forwards the chosen `selectedSlot`.

**Verified:** `tsc --noEmit` clean; `next build` succeeds (googleapis bundles
server-side). Live Gmail/Calendar actions require a Google Cloud OAuth app
(client id/secret + verified scopes) in the environment.

**Next:** Phase 7 — launch hardening (Stripe billing, per-user quotas,
observability, security review).
