-- owner_id：接收方；peer_id：可能被允許傳語音的好友
-- allow_incoming_voice：我是否允許「peer 傳語音過來」（含之後推播擴充）

CREATE TABLE IF NOT EXISTS public.friend_voice_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  peer_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  allow_incoming_voice boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friend_voice_no_self CHECK (owner_id <> peer_id),
  CONSTRAINT friend_voice_one_row UNIQUE (owner_id, peer_id)
);

ALTER TABLE public.friend_voice_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY friend_voice_select_related
  ON public.friend_voice_permissions FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid() OR peer_id = auth.uid());

CREATE POLICY friend_voice_upsert_owner
  ON public.friend_voice_permissions FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY friend_voice_update_owner
  ON public.friend_voice_permissions FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY friend_voice_delete_owner
  ON public.friend_voice_permissions FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

COMMENT ON TABLE public.friend_voice_permissions IS '接收端對特定好友是否允許語音叫醒';
