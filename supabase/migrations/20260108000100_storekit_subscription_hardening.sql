-- Production hardening for App Store subscriptions
-- - StoreKit2 JWS verification metadata
-- - Renewal/cancel notification reconciliation keys

alter table if exists public.user_subscriptions
  add column if not exists store_product_id text,
  add column if not exists original_transaction_id text,
  add column if not exists store_environment text,
  add column if not exists store_bundle_id text,
  add column if not exists store_last_verified_at timestamptz,
  add column if not exists store_last_event_at timestamptz;

-- Ensure we can reliably map renewals (original_transaction_id is stable across renewals).
create unique index if not exists user_subscriptions_original_transaction_id_uidx
  on public.user_subscriptions (original_transaction_id)
  where original_transaction_id is not null;

create index if not exists user_subscriptions_store_product_id_idx
  on public.user_subscriptions (store_product_id);

