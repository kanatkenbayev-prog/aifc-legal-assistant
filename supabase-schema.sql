-- ═══════════════════════════════════════════════════
--  AIFC Legal Assistant — Supabase Schema
--  Run in: Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════

-- 1. Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id                  UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email               TEXT,
  plan                TEXT    NOT NULL DEFAULT 'free',   -- free | starter | professional | expert
  credits             INTEGER NOT NULL DEFAULT 100,
  credits_used_total  INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Queries log
CREATE TABLE IF NOT EXISTS public.queries (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  area         TEXT,
  lang         TEXT        DEFAULT 'ru',
  credits_cost INTEGER     DEFAULT 1,
  rating       SMALLINT    -- 1 thumbs up, -1 thumbs down, NULL unrated
);

-- 3. Feedback (NPS + text comments)
CREATE TABLE IF NOT EXISTS public.feedback (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  query_id   UUID        REFERENCES public.queries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  type       TEXT        NOT NULL,  -- 'thumbs' | 'nps' | 'text'
  value      TEXT
);

-- 4. Subscriptions — placeholder for ioka
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  plan              TEXT        NOT NULL DEFAULT 'free',
  status            TEXT        NOT NULL DEFAULT 'active',  -- active | paused | cancelled
  credits_per_cycle INTEGER     DEFAULT 100,
  ioka_payment_id   TEXT,       -- заполнится после подключения ioka
  started_at        TIMESTAMPTZ DEFAULT NOW(),
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Карантин галлюцинаций — Q&A пары при нажатии 👎 ──
CREATE TABLE IF NOT EXISTS public.bug_reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  area        TEXT,
  question    TEXT,
  answer      TEXT,
  reviewed    BOOLEAN     DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;
-- Любой (в т.ч. гость) может вставить; читать — только сервисная роль (admin)
CREATE POLICY "bug_reports: insert" ON public.bug_reports FOR INSERT WITH CHECK (true);

-- ── Row Level Security ──────────────────────────────
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles: own read"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles: own update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- queries
CREATE POLICY "queries: own read"   ON public.queries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "queries: own insert" ON public.queries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "queries: own update" ON public.queries FOR UPDATE USING (auth.uid() = user_id);

-- feedback
CREATE POLICY "feedback: own insert" ON public.feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "feedback: own read"   ON public.feedback FOR SELECT USING (auth.uid() = user_id);

-- subscriptions
CREATE POLICY "subs: own read" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
