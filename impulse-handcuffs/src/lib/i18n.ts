import {
  bundles,
  type AppLocale,
  type MessageBundle,
  type MockVariant,
} from "./messageBundles";

export type { AppLocale, MessageBundle, MockVariant };

export const MESSAGE_BUNDLES = bundles;

export function detectLocale(): AppLocale {
  const raw =
    typeof navigator !== "undefined" ? navigator.language || "en" : "en";
  const lower = raw.toLowerCase();
  if (lower.startsWith("zh")) return "zh-TW";
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("ko")) return "ko";
  return "en";
}

export function getMessages(locale?: AppLocale): MessageBundle {
  const key = locale ?? detectLocale();
  return bundles[key] ?? bundles.en;
}

export function substitute(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

/** 只用符號 + 數字，不出現 USD、TWD、NTD 等英文幣別碼。 */
const CURRENCY_PREFIX: Record<string, string> = {
  USD: "$",
  TWD: "NT$",
  JPY: "¥",
  KRW: "₩",
  CNY: "¥",
  EUR: "€",
  GBP: "£",
  VND: "₫",
};

export function formatMoney(amount: number, currency: string): string {
  try {
    const fraction =
      currency === "JPY" || currency === "KRW" || currency === "VND" ? 0 : 2;
    const prefix = CURRENCY_PREFIX[currency] ?? "";
    const num = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: fraction,
      minimumFractionDigits: fraction === 0 ? 0 : 0,
    }).format(amount);
    return prefix ? `${prefix}${num}` : num;
  } catch {
    return amount.toFixed(2);
  }
}

export function formatPercent(decimal: number): string {
  return `${(decimal * 100).toFixed(1)}%`;
}
