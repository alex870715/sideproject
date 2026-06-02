-- Zenly 式圓形開霧：造訪點序列（略過六角格）
-- 舊欄位 unlocked_h3_indexes 可保留相容，新客戶端以 visited_points 為主。

ALTER TABLE public.player_fog
  ADD COLUMN IF NOT EXISTS visited_points jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.player_fog.visited_points IS '[{ "lat": number, "lng": number }, ...] 使用者曾「開霧」的圓心';
