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

-- 9. Web push subscriptions.
-- src/services/pushStore.js upserts with { onConflict: 'endpoint' }, so the
-- endpoint column must carry a UNIQUE constraint for that conflict target to
-- resolve. created_at is written as an ISO 8601 string by pushStore, which
-- Postgres accepts directly as a timestamptz literal.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

-- === DATA API GRANTS ===
-- Required for every public-schema table from October 30 onward: new tables
-- are unreachable through the Data API without explicit grants. RLS policies
-- above still govern actual access, so these grants are safe for all rows.

GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;

GRANT SELECT ON public.subscriptions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO service_role;

GRANT SELECT ON public.payments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO service_role;

GRANT SELECT ON public.usage TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage TO service_role;

GRANT SELECT ON public.payment_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_events TO service_role;

GRANT SELECT ON public.tip_history TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tip_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tip_history TO service_role;

GRANT SELECT ON public.two_odds_history TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.two_odds_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.two_odds_history TO service_role;

GRANT SELECT ON public.pending_registrations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_registrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_registrations TO service_role;

GRANT SELECT ON public.admin_audit_log TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_audit_log TO service_role;

-- Future tables in public inherit these grants automatically. NOTE: default
-- privileges only apply to tables created by the role that runs them (the
-- SQL editor / postgres), so any table created outside this path still needs
-- explicit grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO service_role;

-- 10. Advertisement management: position registry + creatives.
-- ad_positions is the canonical catalogue of ad slots (keys match
-- data-ad-position attributes and public/ads.js / src/routes/api.js).
CREATE TABLE IF NOT EXISTS public.ad_positions (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  width INTEGER,
  height INTEGER,
  pages TEXT DEFAULT 'all',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ad_creatives holds every advertisement sold/placed by admin. A position can
-- have several active creatives; the client rotates between them by weight.
CREATE TABLE IF NOT EXISTS public.ad_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_key TEXT NOT NULL REFERENCES public.ad_positions(key) ON DELETE CASCADE,
  advertiser TEXT,
  headline TEXT,
  body TEXT,
  image_url TEXT,
  link_url TEXT,
  cta_text TEXT,
  weight INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  starts_at TIMESTAMP WITH TIME ZONE,
  ends_at TIMESTAMP WITH TIME ZONE,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_creatives_position ON public.ad_creatives(position_key);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_status ON public.ad_creatives(status);

-- Seed the display positions advertised on /advertise.html.
INSERT INTO public.ad_positions (key, label, description, width, height, pages, sort_order) VALUES
  ('global_leaderboard',    'Global Leaderboard',   'Below header on all pages',                728, 90,  'all',           1),
  ('global_rectangle',      'Global Rectangle',     'Sidebar on all pages',                     300, 250, 'all',           2),
  ('global_skyscraper',     'Global Skyscraper',    'Side rail on all pages',                   160, 600, 'all',           3),
  ('in_content',            'In-Content',           'Between prediction cards',                 728, 90,  'predictions',   5),
  ('homepage_featured',     'Homepage Featured',    'Above predictions on homepage',            728, 90,  'homepage',      6),
  ('carousel_slot',         'Homepage Carousel Slot','Featured bookmaker card in homepage carousel', NULL, NULL, 'homepage',   7),
  ('sticky_banner',         'Sticky Banner',        'Fixed bottom bar (all devices)',           NULL, NULL, 'all',           8),
  ('sponsored_match_card',  'Sponsored Match Card', 'In-feed sponsored creative between match cards', 800, 800, 'predictions', 9),
  ('end_of_content',        'End of Content Leaderboard', 'Above the footer at the end of page content', 728, 90, 'all', 10)
ON CONFLICT (key) DO NOTHING;

-- Seed the live 1win sponsored match-card creatives so the existing in-feed
-- banner becomes admin-managed. Only runs when the position has no ads yet.
INSERT INTO public.ad_creatives (position_key, advertiser, headline, image_url, link_url, cta_text, weight, status)
SELECT v.position_key, v.advertiser, v.headline, v.image_url, v.link_url, v.cta_text, v.weight, 'active'
FROM (VALUES
  ('sponsored_match_card', '1win', 'Bet on football with 1win', '/img/banners/1win-banner-a.webp', 'https://one-vv5314.com/betting?open=register&p=f61e', 'Claim offer', 1),
  ('sponsored_match_card', '1win', 'Bet on football with 1win', '/img/banners/1win-banner-b.webp', 'https://one-vv5314.com/betting?open=register&p=f61e', 'Claim offer', 1),
  ('sponsored_match_card', '1win', 'Bet on football with 1win', '/img/banners/1win-banner-c.webp', 'https://one-vv5314.com/betting?open=register&p=f61e', 'Claim offer', 1),
  ('sponsored_match_card', '1win', 'Bet on football with 1win', '/img/banners/1win-banner-d.webp', 'https://one-vv5314.com/betting?open=register&p=f61e', 'Claim offer', 1)
) AS v(position_key, advertiser, headline, image_url, link_url, cta_text, weight)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ad_creatives c WHERE c.position_key = 'sponsored_match_card'
);

-- Seed the 1xbet global leaderboard creative (admin-managed).
INSERT INTO public.ad_creatives (position_key, advertiser, headline, image_url, link_url, cta_text, weight, status)
SELECT 'global_leaderboard', '1xbet', 'Bet on football with 1xbet', '/img/banners/1xbet-leaderboard.webp', 'https://reffpa.com/L?tag=d_6034393m_97c_&site=6034393&ad=97', 'Join Now', 1, 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ad_creatives c WHERE c.position_key = 'global_leaderboard' AND c.advertiser = '1xbet'
);

ALTER TABLE public.ad_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read ad_positions" ON public.ad_positions;
CREATE POLICY "Public can read ad_positions" ON public.ad_positions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can read active ads" ON public.ad_creatives;
CREATE POLICY "Public can read active ads" ON public.ad_creatives
  FOR SELECT USING (status = 'active');

GRANT SELECT ON public.ad_positions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_positions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_positions TO service_role;

GRANT SELECT ON public.ad_creatives TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_creatives TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_creatives TO service_role;

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

-- Ad impression counter (service/endpoint only, atomic increment).
CREATE OR REPLACE FUNCTION public.increment_ad_impression(ad_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.ad_creatives SET impressions = impressions + 1 WHERE id = ad_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ad click counter (service/endpoint only, atomic increment).
CREATE OR REPLACE FUNCTION public.increment_ad_click(ad_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.ad_creatives SET clicks = clicks + 1 WHERE id = ad_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
