/**
 * Content script：在購物頁偵測價格文字，於旁邊掛上「綁手手神器」chip。
 */
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import chipCss from "./chip-shadow.css?inline";
import { detectLocale, getMessages } from "../lib/i18n";
import {
  allowsBareUsdInContext,
  isInNoisyPageRegion,
  parseFirstPrice,
  shouldSkipPriceDueToPromoContext,
  SKIP_SCAN_SELECTOR,
  tryParseMomoNumericOnly,
} from "../lib/priceParse";
import { onTickerChanged } from "../lib/storage";
import { inferSurroundingTone } from "../lib/surroundingTone";
import { BindHandsChip } from "./BindHandsChip";

function readProductLabel(): string {
  const og = document
    .querySelector('meta[property="og:title"]')
    ?.getAttribute("content");
  if (og) return og.trim().slice(0, 120);
  const h1 = document.querySelector("h1")?.textContent?.trim();
  if (h1) return h1.slice(0, 120);
  return getMessages(detectLocale()).itemDefault;
}

function shouldRejectTextNode(node: Text): boolean {
  let el: HTMLElement | null = node.parentElement;
  while (el) {
    if (
      ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE"].includes(
        el.tagName,
      )
    ) {
      return true;
    }
    if (el.closest("[data-bh-chip-host]")) {
      return true;
    }
    if (el.closest(SKIP_SCAN_SELECTOR)) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

function mountOnTextNode(textNode: Text): void {
  const raw = textNode.nodeValue ?? "";
  if (raw.length < 3) return;
  if (shouldRejectTextNode(textNode)) return;
  if (isInNoisyPageRegion(textNode)) return;
  if (shouldSkipPriceDueToPromoContext(textNode)) return;

  const allowBare = allowsBareUsdInContext(textNode);
  let parsed = parseFirstPrice(raw, { allowBareUsd: allowBare });
  if (!parsed) {
    parsed = tryParseMomoNumericOnly(raw, textNode);
  }
  if (!parsed) return;
  const parent = textNode.parentElement;
  if (!parent) return;

  const key = `${parsed.currency}:${parsed.amount}:${raw.length}`;
  if (parent.querySelector(`[data-bh-key="${key}"]`)) return;

  const host = document.createElement("span");
  host.setAttribute("data-bh-chip-host", "1");
  host.setAttribute("data-bh-key", key);
  host.style.display = "inline-flex";
  host.style.alignItems = "center";
  host.style.marginLeft = "10px";
  host.style.verticalAlign = "middle";
  host.style.position = "relative";
  host.style.zIndex = "2147483640";

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = chipCss;
  shadow.appendChild(style);
  const mount = document.createElement("div");
  shadow.appendChild(mount);

  parent.insertBefore(host, textNode.nextSibling);

  const surroundingTone = inferSurroundingTone(parent);
  host.style.filter =
    surroundingTone === "light"
      ? "drop-shadow(0 2px 12px rgba(88, 28, 135, 0.55)) drop-shadow(0 0 18px rgba(217, 119, 6, 0.35))"
      : "drop-shadow(0 3px 10px rgba(249, 115, 22, 0.45)) drop-shadow(0 0 14px rgba(251, 191, 36, 0.35))";

  const itemLabel = readProductLabel();

  const root: Root = createRoot(mount);
  root.render(
    <StrictMode>
      <BindHandsChip
        price={parsed.amount}
        currency={parsed.currency}
        itemLabel={itemLabel}
        surroundingTone={surroundingTone}
      />
    </StrictMode>,
  );
}

function scanDocument(): void {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType !== Node.TEXT_NODE) {
        return NodeFilter.FILTER_SKIP;
      }
      return shouldRejectTextNode(node as Text)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });

  let current = walker.nextNode();
  while (current) {
    mountOnTextNode(current as Text);
    current = walker.nextNode();
  }
}

function teardown(): void {
  document.querySelectorAll("[data-bh-chip-host]").forEach((el) => {
    el.remove();
  });
  document.querySelectorAll(SKIP_SCAN_SELECTOR).forEach((el) => {
    el.remove();
  });
}

let debounce: number | undefined;

function scheduleScan(): void {
  window.clearTimeout(debounce);
  debounce = window.setTimeout(() => {
    scanDocument();
  }, 350);
}

function boot(): void {
  const proto = window.location.protocol;
  if (
    proto === "chrome-extension:" ||
    proto === "moz-extension:" ||
    proto === "edge-extension:"
  ) {
    return;
  }

  scanDocument();

  const obs = new MutationObserver(() => scheduleScan());
  obs.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("load", scheduleScan);
  onTickerChanged(() => {
    teardown();
    scheduleScan();
  });
}

boot();
