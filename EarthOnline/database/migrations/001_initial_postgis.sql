-- Earth Online — Phase 1 核心 Schema（PostgreSQL + PostGIS）
-- 適用 Supabase 或自建 PostgreSQL；執行前請確認已啟用 PostGIS。

-- ---------------------------------------------------------------------------
-- 擴充套件
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- users：玩家與 H3 已解鎖格集合
-- ---------------------------------------------------------------------------
-- current_location: WGS84 點（經緯度），用於寫入最近一次 GPS
-- unlocked_h3_indexes: Uber H3 字串索引陣列（例 res 9: '8928308280ffffb'），永久解鎖迷霧用
CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  current_location geography(Point, 4326),
  unlocked_h3_indexes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_current_location
  ON public.users USING GIST (current_location);

CREATE INDEX idx_users_unlocked_h3_gin
  ON public.users USING GIN (unlocked_h3_indexes);

COMMENT ON TABLE public.users IS '玩家；current_location 為最新 GPS，unlocked_h3_indexes 為已永久解鎖之 H3 cell';
COMMENT ON COLUMN public.users.unlocked_h3_indexes IS 'H3 index 字串陣列，應與 App 端 fog 解鎖解析度一致';

-- ---------------------------------------------------------------------------
-- quests：冒險者看板任務（地理點 + 獎勵）
-- ---------------------------------------------------------------------------
CREATE TABLE public.quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  location_point geography(Point, 4326) NOT NULL,
  reward numeric(12, 2),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quests_location
  ON public.quests USING GIST (location_point);

CREATE INDEX idx_quests_active_location
  ON public.quests (is_active)
  WHERE is_active = true;

COMMENT ON TABLE public.quests IS '短期地理任務；鄰近查詢請用 ST_DWithin 於 location_point';

-- updated_at 可由 API／Supabase Edge Function 在寫入時一併更新；亦可改用 Supabase moddatetime 擴充套件。

-- ---------------------------------------------------------------------------
-- 範例：以經緯度查詢半徑內 quests（公尺）
-- 參數：lng, lat, radius_meters
-- ---------------------------------------------------------------------------
-- SELECT id, title, description, reward,
--        ST_Distance(location_point, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) AS distance_m
-- FROM public.quests
-- WHERE is_active
--   AND ST_DWithin(
--     location_point,
--     ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
--     :radius_meters
--   )
-- ORDER BY distance_m;
