-- 跨裝置戰爭迷霧同步（MVP：同一「同步碼」= 同一列資料）
-- 同步碼請使用足夠長的隨機字串（例如 32+ hex），等同於弱密碼。

CREATE TABLE IF NOT EXISTS public.player_fog (
  sync_key text PRIMARY KEY,
  unlocked_h3_indexes text[] NOT NULL DEFAULT '{}',
  last_lat double precision,
  last_lng double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_fog_updated
  ON public.player_fog (updated_at DESC);

COMMENT ON TABLE public.player_fog IS '以 sync_key 簽到同一存檔；Web/Android/iOS 共用 unlocked_h3_indexes';

-- MVP：允許匿名／登入金鑰讀寫（安全仰賴 sync_key 不可猜測）— 正式上線請改 RLS / Edge Function
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_fog TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_fog TO authenticated;

ALTER TABLE public.player_fog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_fog_anon_all"
  ON public.player_fog
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
