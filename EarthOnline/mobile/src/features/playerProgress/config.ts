/**
 * 玩家進度／個人頁功能開關：之後若要下架整個分頁，改 false 並自 RootNavigator 移除 Tab 即可。
 */
export const PLAYER_PROGRESS_FEATURE = {
  /** 顯示底部「個人」分頁 */
  showProfileTab: true,
  /** 成就定義版本；日後可搭配遠端設定覆寫 registry */
  achievementsRegistryVersion: 1,
} as const;
