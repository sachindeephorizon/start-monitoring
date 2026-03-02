-- Razorpay subscriptions support (Android).
-- Adds server-owned payment/subscription tracking tables and optional columns on user_subscriptions.
--
-- NOTE:
-- - We use IF NOT EXISTS everywhere to be safe on existing projects.
-- - These tables are primarily written by Supabase Edge Functions using the service role key.

-- Track Razorpay subscriptions created for users (mandate + recurring charges).
create table if not exists public.razorpay_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  razorpay_subscription_id text not null unique,
  razorpay_plan_id text,
  status text not null default 'created',
  current_start timestamptz,
  current_end timestamptz,
  total_count int,
  paid_count int,
  remaining_count int,
  short_url text,
  notes jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists razorpay_subscriptions_user_id_idx
on public.razorpay_subscriptions (user_id);

create index if not exists razorpay_subscriptions_subscription_id_idx
on public.razorpay_subscriptions (razorpay_subscription_id);

-- Track payments received from Razorpay (auth transaction and recurring charges).
create table if not exists public.razorpay_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  razorpay_payment_id text not null unique,
  razorpay_subscription_id text,
  razorpay_order_id text,
  amount_subunits int,
  currency text,
  status text,
  method text,
  captured boolean,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists razorpay_payments_user_id_idx
on public.razorpay_payments (user_id);

create index if not exists razorpay_payments_subscription_id_idx
on public.razorpay_payments (razorpay_subscription_id);

-- Webhook event store for idempotency/auditing (dedupe_key = sha256(rawBody)).
create table if not exists public.razorpay_webhook_events (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  event_name text not null,
  razorpay_entity_id text,
  signature text,
  received_at timestamptz not null default now(),
  raw jsonb not null
);

create index if not exists razorpay_webhook_events_event_name_idx
on public.razorpay_webhook_events (event_name);

create index if not exists razorpay_webhook_events_entity_id_idx
on public.razorpay_webhook_events (razorpay_entity_id);

-- Optional: store Razorpay references on the canonical subscription row.
alter table public.user_subscriptions
  add column if not exists payment_provider text,
  add column if not exists payment_status text,
  add column if not exists razorpay_subscription_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_order_id text,
  add column if not exists payment_amount_subunits int,
  add column if not exists payment_currency text,
  add column if not exists payment_captured boolean;

create index if not exists user_subscriptions_razorpay_subscription_id_idx
on public.user_subscriptions (razorpay_subscription_id);

create index if not exists user_subscriptions_razorpay_payment_id_idx
on public.user_subscriptions (razorpay_payment_id);

