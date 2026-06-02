export type ParsedPrice = {
  amount: number;
  currency: string;
};

export type ParsePriceOptions = {
  /** 僅在「主價格區」內允許單獨的 $（否則只認 US$ / USD）。 */
  allowBareUsd?: boolean;
};

function normalizeNumber(raw: string): number {
  return Number.parseFloat(raw.replace(/,/g, ""));
}

/** 絕不掃描：綁手手詳情面板內的價格字串，避免無限增生 chip。 */
export const SKIP_SCAN_SELECTOR = "[data-bh-skip-scan]";

/** 市售價、促銷價、活動價等；多組 class 前綴以涵蓋 momo 改版。 */
const MOMO_PRICE_ZONE = [
  "[itemprop='price']",
  ".sellingPrice",
  "[class*='sellingPrice']",
  "[class*='SellingPrice']",
  "[class*='listPrice']",
  "[class*='ListPrice']",
  "[class*='promoPrice']",
  "[class*='PromoPrice']",
  "[class*='salePrice']",
  "[class*='SalePrice']",
  "[class*='specialPrice']",
  "[class*='SpecialPrice']",
  "[class*='eventPrice']",
  "[class*='EventPrice']",
  "[class*='discountPrice']",
  "[class*='DiscountPrice']",
  "[class*='curPrice']",
  "[class*='CurPrice']",
  "[class*='redPrice']",
  "[class*='RedPrice']",
  "[class*='goods_price']",
  "[id*='goods_price']",
  "[id*='promoPrice']",
  "[id*='salePrice']",
  ".productPrice",
  "[class*='purchaseArea']",
  "[class*='PriceInfo']",
  "[class*='GoodsDetail']",
  "[id*='goodsDetail']",
  "[class*='momoStyle'][class*='price']",
  "main [class*='price']",
].join(",");

export function isInMomoPriceZone(textNode: Text): boolean {
  if (!window.location.hostname.toLowerCase().includes("momoshop.com.tw")) {
    return false;
  }
  return !!textNode.parentElement?.closest(MOMO_PRICE_ZONE);
}

/**
 * momo 常只顯示「1,990」無幣別；僅在主價區、且節點內容幾乎只有數字時視為 TWD。
 */
export function tryParseMomoNumericOnly(
  raw: string,
  textNode: Text,
): ParsedPrice | null {
  if (!isInMomoPriceZone(textNode)) return null;
  const trimmed = raw.replace(/\u00a0/g, " ").trim();
  if (trimmed.length > 18) return null;
  const m = trimmed.match(/^([\d,]+(?:\.\d{1,2})?)(?:\s*起)?\s*$/);
  if (!m) return null;
  const amount = normalizeNumber(m[1]);
  if (!Number.isFinite(amount)) return null;
  if (amount < 10 || amount > 50_000_000) return null;
  if (Number.isInteger(amount) && amount >= 2020 && amount <= 2035)
    return null;
  return { amount, currency: "TWD" };
}

/**
 * 促銷／免運／折扣等語境：同一塊文字裡出現就不掛 chip，避免畫面洗版。
 */
const PROMO_CONTEXT_RE =
  /免運費|免運|運費\s*[:：]?|全館|全店|滿\s*[\d,]+|滿額|滿件|折價券|折扣碼|優惠券|優惠碼|現折|下殺|促銷|限時|任選|加購|\+購|點數|回饋|coupon|promo|voucher|cash\s*back|free\s+shipping|%\s*off|\d+\s*%\s*off|save\s*\$|省\s*\$|extra\s+\d+\s*%|再降|再折/i;

export function contextSuggestsPromotion(blob: string): boolean {
  const s = blob.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (s.length === 0) return false;
  return PROMO_CONTEXT_RE.test(s);
}

/**
 * 是否在常見站台的「主售價」區域，才允許單獨 `$`（美國站用）。
 */
export function allowsBareUsdInContext(textNode: Text): boolean {
  const start = textNode.parentElement;
  if (!start) return false;
  const host = window.location.hostname.replace(/^www\./, "").toLowerCase();

  const closestAny = (sel: string) => !!start.closest(sel);

  if (
    host.endsWith("amazon.com") ||
    host.endsWith("amazon.co.jp") ||
    host.endsWith("amazon.co.uk")
  ) {
    return closestAny(
      [
        ".a-price",
        "#corePrice_feature_div",
        "#corePriceDisplay_desktop_feature_div",
        "#apex_desktop",
        "#twister-plus-price-data-placeholder",
        "[data-feature-name='corePrice']",
      ].join(","),
    );
  }

  if (host.includes("shopee.")) {
    return closestAny(
      [
        "[class*='product-price']",
        "[class*='productPrice']",
        "div[data-testid='product-prices']",
        "[itemprop='price']",
      ].join(","),
    );
  }

  if (host.includes("pchome")) {
    return closestAny(
      "[class*='Price'], [class*='price'], .cost, .prod_price, .value",
    );
  }

  /** momo 購物網（價格多為 NT$；裸 $ 須在此區才放行） */
  if (host.includes("momoshop.com.tw")) {
    return closestAny(MOMO_PRICE_ZONE);
  }

  if (host.includes("rakuten.")) {
    return closestAny(
      ".price-display, [class*='price-display'], [itemprop='price'], .price",
    );
  }

  return false;
}

/** 促銷語境：看自身文字 + 父層一小段，避免拉到整頁。 */
export function shouldSkipPriceDueToPromoContext(textNode: Text): boolean {
  const raw = (textNode.nodeValue ?? "").replace(/\u00a0/g, " ");
  const parent = textNode.parentElement;
  const parentSnippet = parent?.textContent?.replace(/\u00a0/g, " ") ?? "";
  const grand = parent?.parentElement?.textContent?.replace(/\u00a0/g, " ") ?? "";
  const blob = `${raw} ${parentSnippet.slice(0, 220)} ${grand.slice(0, 120)}`;
  return contextSuggestsPromotion(blob);
}

/** 是否明顯在導覽／頁尾／促銷帶，整段跳過掃描。 */
export function isInNoisyPageRegion(textNode: Text): boolean {
  const el = textNode.parentElement;
  if (!el) return true;
  if (el.closest("nav, footer, [role='navigation'], [role='contentinfo']")) {
    return true;
  }
  if (
    el.closest(
      [
        "#nav-footer",
        "#nav-belt",
        "#navbar",
        ".nav-sprite",
        "[data-type='bottom-banner']",
        "[class*='Footer']",
        "[class*='top-banner']",
      ].join(","),
    )
  ) {
    return true;
  }
  return false;
}

/** Extract first plausible product price from a text fragment. */
export function parseFirstPrice(
  text: string,
  opts?: ParsePriceOptions,
): ParsedPrice | null {
  const allowBare = opts?.allowBareUsd ?? false;
  const sample = text.replace(/\u00a0/g, " ").slice(0, 2000);

  const attempts: Array<{ re: RegExp; currency: string }> = [
    { re: /(?:NT\$|NTD)\s*([\d,]+(?:\.\d+)?)/i, currency: "TWD" },
    { re: /(?:US\$|USD)\s*\$?\s*([\d,]+(?:\.\d+)?)/i, currency: "USD" },
    ...(allowBare
      ? [{ re: /\$\s*([\d,]+(?:\.\d+)?)/, currency: "USD" }]
      : []),
    { re: /¥\s*([\d,]+(?:\.\d+)?)/, currency: "JPY" },
    { re: /₩\s*([\d,]+(?:\.\d+)?)/, currency: "KRW" },
    { re: /([\d,]+(?:\.\d+)?)\s*원/, currency: "KRW" },
    { re: /([\d,]+(?:\.\d+)?)\s*円/, currency: "JPY" },
    { re: /([\d,]+(?:\.\d+)?)\s*元/, currency: "TWD" },
  ];

  for (const { re, currency } of attempts) {
    const m = sample.match(re);
    if (!m) continue;
    const amount = normalizeNumber(m[1]);
    if (!Number.isFinite(amount)) continue;
    if (amount < 3 || amount > 50_000_000) continue;
    return { amount, currency };
  }

  return null;
}
