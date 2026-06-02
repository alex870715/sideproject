-- 上傳語音前：必須為已接受好友，且接收端已對發送端開啟 allow_incoming_voice

CREATE OR REPLACE FUNCTION public.enforce_voice_message_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.requester_id = NEW.from_user_id AND f.addressee_id = NEW.to_user_id)
        OR (f.requester_id = NEW.to_user_id AND f.addressee_id = NEW.from_user_id)
      )
  ) THEN
    RAISE EXCEPTION 'VOICE_NOT_FRIENDS';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.friend_voice_permissions p
    WHERE p.owner_id = NEW.to_user_id
      AND p.peer_id = NEW.from_user_id
      AND p.allow_incoming_voice = true
  ) THEN
    RAISE EXCEPTION 'VOICE_PERMISSION_DENIED';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_message_rules ON public.voice_messages;
CREATE TRIGGER trg_voice_message_rules
  BEFORE INSERT ON public.voice_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_voice_message_rules();
