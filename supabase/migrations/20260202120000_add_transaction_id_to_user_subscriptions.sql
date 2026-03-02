-- Adds StoreKit transaction id tracking for iOS subscriptions.
-- Needed by verify_ios_purchase Edge Function (transaction_id anti-replay + latest tx tracking).

alter table public.user_subscriptions
add column if not exists transaction_id text;

create index if not exists user_subscriptions_transaction_id_idx
on public.user_subscriptions (transaction_id);

create index if not exists user_subscriptions_original_transaction_id_idx
on public.user_subscriptions (original_transaction_id);

