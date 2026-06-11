-- Billing: one subscription row per user, kept in sync by the Stripe webhook.
-- Plan + status drive quota enforcement (see src/lib/billing/).

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  status text not null default 'active'
    check (status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_subscriptions_user on subscriptions (user_id);
create index if not exists idx_subscriptions_customer
  on subscriptions (stripe_customer_id);

alter table subscriptions enable row level security;

-- Users may read their own subscription; only the service role (webhook) writes.
create policy "subscriptions: owner read"
  on subscriptions for select to authenticated
  using (user_id = auth.uid());
