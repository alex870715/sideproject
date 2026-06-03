/**
 * 登入流程開關。Auth／好友／語音尚未完整時，維持 false 讓使用者直接進探索頁。
 */
export const AUTH_FEATURE = {
  /** true = 已設定 Supabase 且未登入時，先顯示登入頁 */
  requireSignIn: false,
} as const;
