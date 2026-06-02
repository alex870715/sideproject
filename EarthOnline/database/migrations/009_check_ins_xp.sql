-- 生活打卡／照片（可對陌生人公開瀏覽）+ 經驗值／等級 + 活動參與
-- App：建立 check_in → 上傳圖至 Storage 路徑 {user_id}/{check_in_id}/{檔名}

CREATE TYPE public.check_in_visibility AS ENUM ('private', 'friends', 'public');

CREATE TABLE IF NOT EXISTS public.check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  location geography(Point, 4326) NOT NULL,
  caption text,
  /** 選填：ISO 3166-1 alpha-2，利於統計去過國家／未來成就 */
  country_iso2 text,
  place_label text,
  visibility public.check_in_visibility NOT NULL DEFAULT 'public',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_check_ins_user_created
  ON public.check_ins (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_check_ins_public_feed
  ON public.check_ins (created_at DESC)
  WHERE visibility = 'public';

CREATE INDEX IF NOT EXISTS idx_check_ins_location
  ON public.check_ins USING GIST (location);

COMMENT ON TABLE public.check_ins IS '定點打卡與短文；public 時所有登入使用者可於探索牆看見（陌生人）';

CREATE TABLE IF NOT EXISTS public.check_in_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_in_id uuid NOT NULL REFERENCES public.check_ins (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_in_photos_path_unique UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_check_in_photos_check_in
  ON public.check_in_photos (check_in_id, sort_order);

CREATE TABLE IF NOT EXISTS public.xp_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  amount int NOT NULL,
  reason text NOT NULL,
  ref_type text,
  ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT xp_amount_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_xp_ledger_user_time
  ON public.xp_ledger (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.event_participations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  /** 與 App 內活動 id 對齊，例如 regionActivities / 伺服器事件 slug */
  event_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_participations_once UNIQUE (user_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_event_participations_user
  ON public.event_participations (user_id, created_at DESC);

COMMENT ON TABLE public.event_participations IS '使用者參加過的限時／地域活動；插入成功時觸發一次性 XP';

-- ---------------------------------------------------------------------------
-- profiles：累積經驗與等級（每 ~1000 XP 升 1 級，上限 99，可日後改公式）
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS xp_total bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level smallint NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.recompute_level(xp bigint)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LEAST(99, GREATEST(1, 1 + (xp / 1000)::int))::smallint;
$$;

CREATE OR REPLACE FUNCTION public.apply_xp_from_server(
  p_user_id uuid,
  p_amount int,
  p_reason text,
  p_ref_type text,
  p_ref_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.xp_ledger (user_id, amount, reason, ref_type, ref_id)
  VALUES (p_user_id, p_amount, p_reason, p_ref_type, p_ref_id);
  UPDATE public.profiles
  SET
    xp_total = xp_total + p_amount,
    level = public.recompute_level(xp_total + p_amount),
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_xp_from_server(uuid, int, text, text, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.tr_check_in_award_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.apply_xp_from_server(NEW.user_id, 25, 'check_in', 'check_in', NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_in_xp ON public.check_ins;
CREATE TRIGGER check_in_xp
  AFTER INSERT ON public.check_ins
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_check_in_award_xp();

CREATE OR REPLACE FUNCTION public.tr_event_participation_award_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.apply_xp_from_server(NEW.user_id, 40, 'event_participation', 'event', NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_participation_xp ON public.event_participations;
CREATE TRIGGER event_participation_xp
  AFTER INSERT ON public.event_participations
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_event_participation_award_xp();

-- ---------------------------------------------------------------------------
-- 好友檢查（給 RLS / Storage 用）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.are_friends(u1 uuid, u2 uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.requester_id = u1 AND f.addressee_id = u2)
        OR (f.addressee_id = u1 AND f.requester_id = u2)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.are_friends(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.are_friends(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS：check_ins
-- ---------------------------------------------------------------------------
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY check_ins_select_visible
  ON public.check_ins
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR visibility = 'public'
    OR (
      visibility = 'friends'
      AND public.are_friends(auth.uid(), user_id)
    )
  );

CREATE POLICY check_ins_insert_own
  ON public.check_ins
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY check_ins_update_own
  ON public.check_ins
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY check_ins_delete_own
  ON public.check_ins
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS：check_in_photos（需能讀到可見打卡下的照片列）
-- ---------------------------------------------------------------------------
ALTER TABLE public.check_in_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY check_in_photos_select_if_check_in_visible
  ON public.check_in_photos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.check_ins c
      WHERE c.id = check_in_photos.check_in_id
        AND (
          c.user_id = auth.uid()
          OR c.visibility = 'public'
          OR (
            c.visibility = 'friends'
            AND public.are_friends(auth.uid(), c.user_id)
          )
        )
    )
  );

CREATE POLICY check_in_photos_insert_own_check_in
  ON public.check_in_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.check_ins c
      WHERE c.id = check_in_photos.check_in_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY check_in_photos_delete_own_check_in
  ON public.check_in_photos
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.check_ins c
      WHERE c.id = check_in_photos.check_in_id
        AND c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- RLS：xp_ledger / event_participations（僅本人）
-- ---------------------------------------------------------------------------
ALTER TABLE public.xp_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY xp_ledger_select_own
  ON public.xp_ledger
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public.event_participations ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_participations_select_own
  ON public.event_participations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY event_participations_insert_own
  ON public.event_participations
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage：check-in-photos（路徑：{uid}/{check_in_id}/{file}）
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('check-in-photos', 'check-in-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY check_in_photos_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'check-in-photos'
    AND split_part(name, '/', 1) = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.check_ins c
      WHERE c.id = (split_part(name, '/', 2))::uuid
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY check_in_photos_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'check-in-photos'
    AND EXISTS (
      SELECT 1
      FROM public.check_in_photos p
      JOIN public.check_ins c ON c.id = p.check_in_id
      WHERE p.storage_path = name
        AND (
          c.user_id = auth.uid()
          OR c.visibility = 'public'
          OR (
            c.visibility = 'friends'
            AND public.are_friends(auth.uid(), c.user_id)
          )
        )
    )
  );

CREATE POLICY check_in_photos_storage_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'check-in-photos'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

COMMENT ON COLUMN public.profiles.xp_total IS '累積經驗值；打卡／活動等寫入 xp_ledger 並觸發更新';
COMMENT ON COLUMN public.profiles.level IS 'derived 緩存：recompute_level(xp_total)，約每 1000 XP +1 級';
