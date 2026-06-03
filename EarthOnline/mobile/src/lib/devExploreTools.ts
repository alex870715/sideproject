/**
 * 探索頁進階工具（搖桿、示範路徑、檔案匯入、清除足跡）僅供測試或內部開發。
 * 預設地點與隨機移動已對所有使用者開放，不在此門檻內。
 *
 * 顯示條件（任一成立）：
 * - Metro / debug：`__DEV__ === true`
 * - `.env`：`EXPO_PUBLIC_DEV_EXPLORE_TOOLS=1`（內測包手動開）
 * - 登入 Email 列在 `EXPO_PUBLIC_DEV_TESTER_EMAILS`（逗號分隔，不分大小寫）
 */

const TESTER_EMAILS_RAW = process.env.EXPO_PUBLIC_DEV_TESTER_EMAILS ?? '';

const TESTER_EMAILS = new Set(
  TESTER_EMAILS_RAW.split(',')
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean),
);

export function isDevExploreToolsVisible(
  signedInEmail?: string | null,
): boolean {
  if (__DEV__) return true;
  if (process.env.EXPO_PUBLIC_DEV_EXPLORE_TOOLS === '1') return true;
  const em = signedInEmail?.trim().toLowerCase();
  if (em && TESTER_EMAILS.has(em)) return true;
  return false;
}
