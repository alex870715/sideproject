import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Shield } from "lucide-react";
import { getCagrDecimal } from "../lib/cagr";
import { futureValue } from "../lib/investment";
import type { MessageBundle } from "../lib/i18n";
import { formatMoney, formatPercent, getMessages } from "../lib/i18n";
import { classifyMock, selectMockCopy } from "../lib/mocking";
import type { PageSurroundTone } from "../lib/surroundingTone";
import {
  getSelectedTicker,
  onLocalePreferenceChanged,
  onTickerChanged,
  resolveUiLocale,
} from "../lib/storage";

/** Chrome / WebKit 實務上足夠蓋過多數電商 sticky、lightbox。 */
const FLOATING_Z = 2_147_483_640;

export type BindHandsChipProps = {
  price: number;
  currency: string;
  itemLabel: string;
  surroundingTone: PageSurroundTone;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 購物頁價格旁的「綁手手」懸浮按鈕與試算／吐槽詳情面板。 */
export function BindHandsChip({
  price,
  currency,
  itemLabel,
  surroundingTone,
}: BindHandsChipProps) {
  const [ticker, setTicker] = useState("VOO");
  const [messages, setMessages] = useState<MessageBundle>(() =>
    getMessages(),
  );
  const [roastRoll, setRoastRoll] = useState(0);
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ left: 0, top: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number>();

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = undefined;
    }, 140);
  }, [cancelClose]);

  const refreshMessages = useCallback(() => {
    void resolveUiLocale().then((locale) => {
      setMessages(getMessages(locale));
    });
  }, []);

  useEffect(() => {
    refreshMessages();
    return onLocalePreferenceChanged(() => {
      refreshMessages();
    });
  }, [refreshMessages]);

  useEffect(() => {
    void getSelectedTicker().then(setTicker);
    return onTickerChanged(setTicker);
  }, []);

  const cagrDecimal = useMemo(() => getCagrDecimal(ticker), [ticker]);
  const fv = useMemo(
    () => futureValue(price, cagrDecimal),
    [price, cagrDecimal],
  );
  const kind = classifyMock(price, fv, cagrDecimal);
  const mock = useMemo(
    () =>
      selectMockCopy(
        kind,
        messages,
        {
          item: itemLabel,
          ticker,
          price,
          fv,
          currency,
        },
        roastRoll,
      ),
    [kind, messages, itemLabel, ticker, price, fv, currency, roastRoll],
  );

  const kindGradient =
    kind === "high"
      ? "wvp-from-rose-600 wvp-via-orange-500 wvp-to-amber-500"
      : kind === "bag"
        ? "wvp-from-emerald-600 wvp-via-teal-500 wvp-to-cyan-400"
        : "wvp-from-indigo-700 wvp-via-violet-600 wvp-to-fuchsia-500";

  const kindRing =
    kind === "high"
      ? "focus-visible:wvp-ring-rose-300/80"
      : kind === "bag"
        ? "focus-visible:wvp-ring-emerald-300/80"
        : "focus-visible:wvp-ring-indigo-300/80";

  /** 亮底頁：深紫漸層 + 琥珀字／圖示，避免綁手手 chip 與白底融在一起。 */
  const chipButtonClass =
    surroundingTone === "light"
      ? `wvp-inline-flex wvp-items-center wvp-gap-2 wvp-rounded-full wvp-border-2 wvp-border-amber-400/90 wvp-bg-gradient-to-r wvp-from-violet-900 wvp-via-fuchsia-900 wvp-to-indigo-950 wvp-px-4 wvp-py-2.5 wvp-text-[13px] wvp-font-extrabold wvp-text-amber-100 wvp-shadow-[0_6px_26px_rgba(76,29,149,0.5),0_0_0_1px_rgba(251,191,36,0.35)_inset] wvp-outline-none wvp-transition-[transform,filter,box-shadow] hover:wvp-scale-[1.04] hover:wvp-brightness-110 ${kindRing} focus-visible:wvp-ring-4 active:wvp-scale-[0.98]`
      : `wvp-inline-flex wvp-items-center wvp-gap-2 wvp-rounded-full wvp-border-[3px] wvp-border-white/75 wvp-bg-gradient-to-r ${kindGradient} wvp-px-4 wvp-py-2.5 wvp-text-[13px] wvp-font-extrabold wvp-text-white wvp-shadow-[0_8px_28px_rgba(249,115,22,0.55),0_0_0_4px_rgba(251,191,36,0.35)] wvp-outline-none wvp-transition-[transform,filter] hover:wvp-scale-[1.04] hover:wvp-brightness-110 focus-visible:wvp-ring-4 focus-visible:wvp-ring-amber-200/90 active:wvp-scale-[0.98]`;

  const tickerPillClass =
    surroundingTone === "light"
      ? "wvp-rounded-full wvp-bg-black/40 wvp-px-2.5 wvp-py-1 wvp-text-[11px] wvp-font-black wvp-uppercase wvp-tracking-wider wvp-text-amber-50 wvp-ring-1 wvp-ring-amber-400/60"
      : "wvp-rounded-full wvp-bg-black/25 wvp-px-2.5 wvp-py-1 wvp-text-[11px] wvp-font-black wvp-uppercase wvp-tracking-wider wvp-ring-1 wvp-ring-white/40";

  const iconClass =
    surroundingTone === "light"
      ? "wvp-h-[18px] wvp-w-[18px] wvp-shrink-0 wvp-text-amber-300 wvp-drop-shadow-md"
      : "wvp-h-[18px] wvp-w-[18px] wvp-shrink-0 wvp-text-amber-100 wvp-drop-shadow";

  const labelClass =
    surroundingTone === "light"
      ? "wvp-tracking-wide wvp-text-amber-50 wvp-drop-shadow-sm"
      : "wvp-tracking-wide wvp-drop-shadow-sm";

  const updatePanelPosition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const panelW = 302;
    const margin = 10;
    const gap = 6;
    const estH = 340;
    let left = r.left + r.width / 2 - panelW / 2;
    left = clamp(left, margin, window.innerWidth - panelW - margin);
    let top = r.bottom + gap;
    if (top + estH > window.innerHeight - margin) {
      top = r.top - gap - estH;
    }
    if (top < margin) {
      top = margin;
    }
    setPanelPos({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const onScrollOrResize = () => updatePanelPosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePanelPosition]);

  const panel = open ? (
    <div
      data-bh-skip-scan="1"
      role="dialog"
      aria-label={messages.brand}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      style={{
        position: "fixed",
        left: panelPos.left,
        top: panelPos.top,
        zIndex: FLOATING_Z,
        width: 302,
        maxHeight: "min(420px, calc(100vh - 20px))",
        overflow: "auto",
        boxSizing: "border-box",
        padding: "18px 17px 16px",
        borderRadius: 20,
        border: "2px solid rgba(251, 191, 36, 0.45)",
        background:
          "linear-gradient(165deg, #1a0d2e 0%, #251240 42%, #12081c 100%)",
        color: "#fef3c7",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "PingFang TC", "Microsoft JhengHei", sans-serif',
        fontSize: 13,
        lineHeight: 1.45,
        boxShadow:
          "0 28px 64px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(192, 132, 252, 0.25) inset, 0 0 48px rgba(234, 88, 12, 0.18)",
      }}
    >
      <span
        style={{
          display: "block",
          marginBottom: 12,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "rgba(251, 191, 36, 0.95)",
          textShadow: "0 0 20px rgba(251, 191, 36, 0.35)",
        }}
      >
        {messages.brand} · 10y
      </span>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "rgba(253, 230, 138, 0.55)" }}>
            {messages.breakdownPrice}
          </span>
          <span style={{ fontWeight: 700, color: "#fff7ed" }}>
            {formatMoney(price, currency)}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "rgba(253, 230, 138, 0.55)" }}>
            {messages.breakdownYears}
          </span>
          <span style={{ color: "#fef3c7" }}>10</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "rgba(253, 230, 138, 0.55)" }}>
            {messages.breakdownCagr}
          </span>
          <span style={{ fontWeight: 700, color: "#fdba74" }}>
            {formatPercent(cagrDecimal)} ({ticker})
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "rgba(253, 230, 138, 0.55)" }}>
            {messages.breakdownFv}
          </span>
          <span style={{ fontWeight: 800, color: "#fde68a" }}>
            {formatMoney(fv, currency)}
          </span>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          borderRadius: 16,
          padding: 13,
          background: "rgba(251, 191, 36, 0.09)",
          border: "1px solid rgba(251, 191, 36, 0.28)",
          boxShadow: "0 0 24px rgba(0, 0, 0, 0.2) inset",
        }}
      >
        <div
          style={{
            marginBottom: 8,
            fontSize: 11,
            fontWeight: 800,
            color: "#fcd34d",
            letterSpacing: "0.02em",
          }}
        >
          {mock.title}
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: "rgba(254, 243, 199, 0.92)" }}>
          {mock.body}
        </p>
      </div>

      <p style={{ margin: "15px 0 0", fontSize: 10, color: "rgba(216, 180, 254, 0.45)" }}>
        {messages.footnote}
      </p>
    </div>
  ) : null;

  return (
    <span className="wvp-inline-flex wvp-items-center wvp-font-sans">
      <button
        ref={btnRef}
        type="button"
        className={chipButtonClass}
        onMouseEnter={() => {
          cancelClose();
          setRoastRoll(Math.random());
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
        onFocus={() => {
          cancelClose();
          setRoastRoll(Math.random());
          setOpen(true);
        }}
        onBlur={scheduleClose}
        aria-expanded={open}
        aria-label={messages.brand}
      >
        <Shield className={iconClass} strokeWidth={2.6} />
        <span className={labelClass}>{messages.brand}</span>
        <span
          className={`${tickerPillClass} ${surroundingTone === "dark" ? "wvp-text-white" : ""}`}
        >
          {ticker}
        </span>
      </button>

      {panel ? createPortal(panel, document.body) : null}
    </span>
  );
}
