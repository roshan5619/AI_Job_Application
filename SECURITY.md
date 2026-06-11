# Security Model

This document describes how the AI Execution Agent protects user data and
limits blast radius. It is a living reference for the security review.

## Tenancy & data isolation

- **Row-Level Security (RLS)** is enabled on every user-owned table
  (`supabase/migrations/0002_rls.sql`, `0004_billing.sql`). A signed-in user can
  only read/write rows where `user_id = auth.uid()`. The shared `job_listings`
  table is read-only to authenticated users.
- **Storage**: the private `resumes` bucket enforces per-user folder access —
  objects are namespaced `<user_id>/...` and policies restrict each user to
  their own folder (`0003_storage.sql`).
- **Service-role usage**: background workflows use the service-role key, which
  bypasses RLS, so every workflow query scopes by `user_id` explicitly.

## Secrets & tokens

- **OAuth tokens** (Google) are encrypted with **AES-256-GCM**
  (`src/lib/crypto.ts`) before storage and decrypted only in memory at point of
  use. They are never logged.
- The **structured logger** (`src/lib/log.ts`) redacts any field whose key
  matches `token|secret|password|api_key|authorization|cookie`.
- The service-role key, Stripe secret, and encryption key are server-only env
  vars and never shipped to the browser.

## Human-in-the-loop authorization

- **No outward action is automatic.** Submitting an application, sending a
  follow-up email, and booking an interview each require an explicit approval
  (`step.waitForEvent`). This is both a product choice and an abuse-prevention
  control (no autonomous spam).
- Emails are sent through the **user's own Gmail** (their identity), not a
  shared domain.

## Webhooks

- **Stripe** (`/api/stripe/webhook`) and **Inngest** (`/api/inngest`) verify
  their own signatures and are excluded from the auth middleware so they receive
  the raw request body. Unverified payloads are rejected.

## Transport & headers

- Security headers are set globally (`next.config.mjs`): `nosniff`,
  `X-Frame-Options: DENY`, strict `Referrer-Policy`, HSTS, and a restrictive
  `Permissions-Policy`.

## Quotas & abuse limits

- Per-user, per-plan quotas (`src/lib/billing/quota.ts`) cap active missions and
  monthly application submissions, enforced server-side at the mission-create
  and application-approve boundaries.

## Open items for the security review

- Add rate limiting on auth and API routes (e.g. middleware + Upstash).
- Add a Content-Security-Policy header tuned to the app's asset origins.
- Consider per-user Gmail/Calendar scope minimization and token revocation on
  account deletion.
- Penetration test the approval-resolution and webhook endpoints.
