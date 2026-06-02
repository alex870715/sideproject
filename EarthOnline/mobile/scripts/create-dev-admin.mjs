/**
 * 建立／更新開發用 admin（需 Service Role，勿打包進 App）。
 *
 * 會嘗試讀取上一層的 `.env`（與 Expo 相同目錄），帶入 EXPO_PUBLIC_SUPABASE_URL；
 * **SUPABASE_SERVICE_ROLE_KEY** 仍請自行設定，勿寫進版控。
 *
 * 選用環境變數：ADMIN_EMAIL、ADMIN_PASSWORD、ADMIN_USERNAME
 *
 * 執行（在 mobile 目錄）：
 *   export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
 *   npm run seed:admin
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnvOptional() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* 無 .env 可略過 */
  }
}

loadDotEnvOptional();

const url =
  process.env.SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  '';
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@earthonline.test';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'alex0715';
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'admin').toLowerCase().replace(/[^a-z0-9_]/g, '');
const DISPLAY_NAME = process.env.ADMIN_DISPLAY_NAME || 'Admin';

async function main() {
  if (!url || !serviceRole) {
    console.error(
      '缺少 SUPABASE_URL（或 EXPO_PUBLIC_SUPABASE_URL）或 SUPABASE_SERVICE_ROLE_KEY。',
    );
    process.exit(1);
  }

  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: listData, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) {
    console.error('listUsers:', listErr.message);
    process.exit(1);
  }

  const found = listData?.users?.find(
    (u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
  );

  let userId;

  if (found) {
    userId = found.id;
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: {
        username: ADMIN_USERNAME,
        display_name: DISPLAY_NAME,
      },
    });
    if (updErr) {
      console.error('updateUser:', updErr.message);
      process.exit(1);
    }
    console.log('已更新既有使用者', ADMIN_EMAIL);
  } else {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: {
        username: ADMIN_USERNAME,
        display_name: DISPLAY_NAME,
      },
    });
    if (cErr) {
      console.error('createUser:', cErr.message);
      process.exit(1);
    }
    userId = created.user.id;
    console.log('已建立使用者', ADMIN_EMAIL);
  }

  const { data: ud, error: guErr } = await admin.auth.admin.getUserById(userId);
  if (!guErr && ud?.user) {
    console.log(
      'email_confirmed_at:',
      ud.user.email_confirmed_at ?? '（null — 未驗證時 App 會無法登入）',
    );
  }

  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  if (anonKey) {
    const anon = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signErr } = await anon.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    if (signErr) {
      console.error(
        '\n⚠ 已用 Anon（與手機 App 相同）測試登入，仍失敗：',
        signErr.message,
      );
      console.error(
        '   請檢查：Dashboard 是否同一專案、密碼是否一致、信箱是否已驗證。',
      );
    } else {
      console.log('\n✓ Anon 登入測試成功（與 App 行為一致）。');
      await anon.auth.signOut();
    }
  } else {
    console.warn(
      '\n（.env 未設定 EXPO_PUBLIC_SUPABASE_ANON_KEY，略過登入自測）',
    );
  }

  const { error: profErr } = await admin.from('profiles').upsert(
    {
      id: userId,
      username: ADMIN_USERNAME,
      display_name: DISPLAY_NAME,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (profErr) {
    console.warn(
      'profiles upsert（若尚未跑 004 migration 可忽略）:',
      profErr.message,
    );
  } else {
    console.log('已同步 public.profiles');
  }

  console.log('\nApp 請用「Email + 密碼」登入（與註冊畫面相同）：');
  console.log('  Email:', ADMIN_EMAIL);
  if (process.env.ADMIN_PASSWORD) {
    console.log('  密碼: 已自環境變數 ADMIN_PASSWORD 設定');
  } else {
    console.log('  密碼: alex0715（僅預設測試用，上線前請改）');
  }
  console.log('  公開名稱: @' + ADMIN_USERNAME);
}

main();
