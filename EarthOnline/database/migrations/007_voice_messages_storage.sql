-- 語音訊息 metadata；實檔放 Storage bucket voice-messages
-- storage_path 格式：<from_user_id>/<message_id>.m4a

CREATE TABLE IF NOT EXISTS public.voice_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  duration_seconds int,
  created_at timestamptz NOT NULL DEFAULT now(),
  played_at timestamptz,
  CONSTRAINT voice_no_self CHECK (from_user_id <> to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_voice_to_user ON public.voice_messages (to_user_id, created_at DESC);

ALTER TABLE public.voice_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY voice_select_parties
  ON public.voice_messages FOR SELECT
  TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

CREATE POLICY voice_insert_from_self
  ON public.voice_messages FOR INSERT
  TO authenticated
  WITH CHECK (from_user_id = auth.uid());

CREATE POLICY voice_update_receiver_played
  ON public.voice_messages FOR UPDATE
  TO authenticated
  USING (to_user_id = auth.uid())
  WITH CHECK (to_user_id = auth.uid());

-- Storage（若 bucket 已存在會略過 INSERT）
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-messages', 'voice-messages', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY voice_storage_upload_own_prefix
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'voice-messages'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY voice_storage_read_participants
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'voice-messages'
    AND EXISTS (
      SELECT 1 FROM public.voice_messages v
      WHERE v.storage_path = storage.objects.name
        AND (v.from_user_id = auth.uid() OR v.to_user_id = auth.uid())
    )
  );

COMMENT ON TABLE public.voice_messages IS '好友語音條；播放前請 createSignedUrl';
