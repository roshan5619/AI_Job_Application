# AI Execution Agent

Tell it your goal — _"Get me a remote ML job."_ — and the agent runs the hunt
end to end: finds matching roles, tailors your resume per role, prepares
applications, follows up, and schedules interviews. You just approve.

The product surface is intentionally minimal: an **Approval Inbox** and an
**Activity Feed**. No dashboards full of knobs.

## Architecture

A durable **Inngest** workflow (not a chat loop) orchestrates the pipeline;
**Claude** does the reasoning-heavy steps; **Supabase** stores everything with
per-user RLS; **Next.js** serves the UI. A human approves every outward action
(application submit, email send) via `step.waitForEvent`.

```
discover → score → tailor → review(wait) → apply → follow-up → triage → schedule
```

See `~/.claude/plans/ai-execution-agent-the-fuzzy-codd.md` for the full plan.

## Stack

- **Next.js 15** (App Router, TS, Tailwind) on Vercel
- **Supabase** — Postgres + Auth + Storage, RLS-scoped by `user_id`
- **Inngest** — durable step functions, cron, human-in-the-loop pauses
- **Anthropic SDK** — `claude-opus-4-8` (tailoring) / `claude-haiku-4-5` (parse/score/triage)
- Job sources: Adzuna, USAJobs, Greenhouse/Lever boards
- Google APIs (Gmail + Calendar) via per-user OAuth, tokens encrypted at rest

## Setup

```bash
npm install
cp .env.example .env.local   # fill in keys
# Apply DB migrations in supabase/migrations/ to your Supabase project
npm run dev                  # Next.js
npm run inngest              # Inngest dev server (separate terminal)
```

Generate the integration encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Status

Phase 0 (foundations) complete: project scaffold, schema + RLS, Claude wrapper,
Supabase clients, encrypted integrations store, Inngest wiring. Subsequent
phases (profile/goal, discovery/match, tailoring, review/apply, follow-up,
scheduling, hardening) build on this foundation.
