import type { MessageBundle } from "./messageBundles";
import { formatMoney, substitute } from "./i18n";

export type MockKind = "high" | "bag" | "neutral";

export function classifyMock(
  price: number,
  fv: number,
  cagrDecimal: number,
): MockKind {
  if (cagrDecimal < 0) return "bag";
  if (fv > price * 2) return "high";
  return "neutral";
}

function pickVariant<T>(items: T[], roll: number): T {
  if (items.length === 0) {
    throw new Error("pickVariant: empty list");
  }
  const idx = Math.min(
    items.length - 1,
    Math.floor(roll * items.length),
  );
  return items[idx]!;
}

export function selectMockCopy(
  kind: MockKind,
  m: MessageBundle,
  ctx: {
    item: string;
    ticker: string;
    price: number;
    fv: number;
    currency: string;
  },
  roll: number,
): { title: string; body: string } {
  const vars: Record<string, string> = {
    item: ctx.item,
    ticker: ctx.ticker,
    price: formatMoney(ctx.price, ctx.currency),
    fv: formatMoney(ctx.fv, ctx.currency),
  };

  if (kind === "high") {
    const v = pickVariant(m.mockHighVariants, roll);
    return { title: v.title, body: substitute(v.body, vars) };
  }
  if (kind === "bag") {
    const v = pickVariant(m.mockBagVariants, roll);
    return { title: v.title, body: substitute(v.body, vars) };
  }
  const v = pickVariant(m.mockNeutralVariants, roll);
  return { title: v.title, body: substitute(v.body, vars) };
}
