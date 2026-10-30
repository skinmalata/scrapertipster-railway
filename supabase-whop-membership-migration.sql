-- Run once in Supabase SQL Editor for existing installations.
-- Fresh installations also receive these columns and index from supabase-schema.sql.
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_membership_unique
  ON public.subscriptions (payment_method, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;
