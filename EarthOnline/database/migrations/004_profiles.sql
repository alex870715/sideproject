-- 使用者公開資料（與 Supabase Auth 1:1）
-- expo_push_token 供之後 Edge Function 發推播叫醒

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username text NOT NULL,
  display_name text,
  expo_push_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_ci_unique
  ON public.profiles (lower(username));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_read_all
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY profiles_insert_own
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

COMMENT ON TABLE public.profiles IS 'Earth Online 玩家公開檔；註冊時由 trigger 建立';

-- 註冊自動建立 profile（username 請由 App signUp metadata 帶入）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  un text;
BEGIN
  un := COALESCE(
    NEW.raw_user_meta_data->>'username',
    'user_' || SUBSTRING(REPLACE(NEW.id::text, '-', ''), 1, 12)
  );
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    un,
    COALESCE(NEW.raw_user_meta_data->>'display_name', un)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
