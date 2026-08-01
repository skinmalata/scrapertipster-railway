-- WinFulltime Pro Membership — Full Database Schema
-- Run this in your Supabase SQL Editor (public schema)

-- 1. Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  vip_status TEXT DEFAULT 'free' CHECK (vip_status IN ('free', 'vip', 'admin')),
  vip_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('monthly', 'yearly', 'lifetime')),
  payment_id TEXT UNIQUE,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'active', 'completed', 'failed', 'cancelled', 'expired')),
  amount DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL DEFAULT 'lemonsqueezy',
  provider_payment_id TEXT UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  payment_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Usage table (daily action limits for free tier)
CREATE TABLE IF NOT EXISTS public.usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, action, usage_date)
);

-- 5. Payment events table (webhook idempotency)
CREATE TABLE IF NOT EXISTS public.payment_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, event_id)
);

-- 6. Tip history (in-play results persistence)
CREATE TABLE IF NOT EXISTS public.tip_history (
  day TEXT PRIMARY KEY,
  tips JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Two Odds history
CREATE TABLE IF NOT EXISTS public.two_odds_history (
  date TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Pending registrations (paywall-first signup: an account is only created
-- after the payment webhook fires, so no unpaid accounts can exist).
CREATE TABLE IF NOT EXISTS public.pending_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reg_token TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('monthly', 'yearly', 'lifetime')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_pending_registrations_reg_token ON public.pending_registrations(reg_token);
CREATE INDEX IF NOT EXISTS idx_pending_registrations_email ON public.pending_registrations(email);

-- === INDEXES ===
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_vip_status ON public.profiles(vip_status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_usage_user_action_date ON public.usage(user_id, action, usage_date);

-- === ROW LEVEL SECURITY ===
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tip_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.two_odds_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_registrations ENABLE ROW LEVEL SECURITY;

-- === RLS POLICIES ===

-- Profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND vip_status = 'admin')
  );

-- Subscriptions
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can view own subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Payments
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
CREATE POLICY "Users can view own payments" ON public.payments
  FOR SELECT USING (auth.uid() = user_id);

-- Usage: users can read own usage, no write from client
DROP POLICY IF EXISTS "Users can view own usage" ON public.usage;
CREATE POLICY "Users can view own usage" ON public.usage
  FOR SELECT USING (auth.uid() = user_id);

-- Payment events: no client access
DROP POLICY IF EXISTS "No client access to payment_events" ON public.payment_events;
CREATE POLICY "No client access to payment_events" ON public.payment_events
  FOR SELECT USING (false);

-- Tip history: public read, service upsert
DROP POLICY IF EXISTS "Public can read tip_history" ON public.tip_history;
CREATE POLICY "Public can read tip_history" ON public.tip_history
  FOR SELECT USING (true);

-- Two odds history: public read, service upsert
DROP POLICY IF EXISTS "Public can read two_odds_history" ON public.two_odds_history;
CREATE POLICY "Public can read two_odds_history" ON public.two_odds_history
  FOR SELECT USING (true);

-- Pending registrations: no client access (service-role only)
DROP POLICY IF EXISTS "No client access to pending_registrations" ON public.pending_registrations;
CREATE POLICY "No client access to pending_registrations" ON public.pending_registrations
  FOR ALL USING (false);

-- 9. Admin audit log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_id ON public.admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON public.admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log(created_at);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No client access to admin_audit_log" ON public.admin_audit_log;
CREATE POLICY "No client access to admin_audit_log" ON public.admin_audit_log
  FOR ALL USING (false);

-- === FUNCTIONS ===

-- Auto-create profile on signup. No free trial is granted: accounts created
-- through the paywall-first signup flow are activated by the payment webhook
-- (set_vip_status), so new users start as 'free' until they have paid.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, vip_status, vip_expires_at)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    'free',
    NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Set/update VIP status (service-role only)
CREATE OR REPLACE FUNCTION public.set_vip_status(user_uuid UUID, vip_expires TIMESTAMP)
RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles
  SET vip_status = 'vip', vip_expires_at = vip_expires, updated_at = NOW()
  WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke VIP status (service-role only)
CREATE OR REPLACE FUNCTION public.revoke_vip_status(user_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles
  SET vip_status = 'free', vip_expires_at = NULL, updated_at = NOW()
  WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic consumption of daily free allowance (returns remaining)
CREATE OR REPLACE FUNCTION public.consume_free_allowance(
  p_user_id UUID,
  p_action TEXT,
  p_max_daily INTEGER DEFAULT 3
)
RETURNS TABLE(remaining INTEGER) AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.usage (user_id, action, usage_date, count)
  VALUES (p_user_id, p_action, CURRENT_DATE, 1)
  ON CONFLICT (user_id, action, usage_date)
  DO UPDATE SET count = public.usage.count + 1;

  SELECT u.count INTO v_count
  FROM public.usage u
  WHERE u.user_id = p_user_id
    AND u.action = p_action
    AND u.usage_date = CURRENT_DATE;

  IF v_count > p_max_daily THEN
    RAISE EXCEPTION 'Daily limit reached' USING ERRCODE = 'LMIT';
  END IF;

  RETURN QUERY SELECT GREATEST(p_max_daily - v_count, 0)::INTEGER AS remaining;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
