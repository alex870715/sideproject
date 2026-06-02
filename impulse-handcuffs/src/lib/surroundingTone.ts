export type PageSurroundTone = "light" | "dark";

type Rgba = { r: number; g: number; b: number; a: number };

function parseCssColor(css: string): Rgba | null {
  const s = css.trim();
  if (!s || s === "transparent") return { r: 255, g: 255, b: 255, a: 0 };

  const rgb = s.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] !== undefined ? Number(rgb[4]) : 1,
    };
  }
  return null;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = [r, g, b].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

/**
 * 從價格節點往外找第一個夠不透明的 background，推斷頁面局部是偏亮或偏暗，
 * 用來決定綁手手 chip 要用高對比深色系還是亮色發光系。
 */
export function inferSurroundingTone(start: HTMLElement | null): PageSurroundTone {
  let el: HTMLElement | null = start;
  for (let i = 0; i < 12 && el; i++) {
    const bg = getComputedStyle(el).backgroundColor;
    const p = parseCssColor(bg);
    if (p && p.a >= 0.82) {
      const lum = relativeLuminance(p.r, p.g, p.b);
      return lum > 0.58 ? "light" : "dark";
    }
    el = el.parentElement;
  }

  if (document.body) {
    const p = parseCssColor(getComputedStyle(document.body).backgroundColor);
    if (p && p.a >= 0.5) {
      return relativeLuminance(p.r, p.g, p.b) > 0.55 ? "light" : "dark";
    }
  }

  return "light";
}
