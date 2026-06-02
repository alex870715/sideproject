import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { TICKER_OPTIONS, getCagrDecimal } from "./lib/cagr";
import { detectLocale, formatPercent, getMessages } from "./lib/i18n";
import { LOCALE_SELECT_OPTIONS } from "./lib/localeOptions";
import { futureValue } from "./lib/investment";
import { useStandaloneWindowFit } from "./lib/standaloneWindowFit";
import {
  effectiveLocale,
  getLocalePreference,
  getSelectedTicker,
  setLocalePreference,
  setSelectedTicker,
  type LocalePreference,
} from "./lib/storage";

function isStandaloneSettingsWindow(): boolean {
  return (
    new URLSearchParams(window.location.search).get("standalone") === "1"
  );
}

export default function App() {
  const [localePref, setLocalePref] = useState<LocalePreference>("auto");
  const [ticker, setTicker] = useState("VOO");
  const hideOpenWindowCta = useMemo(() => isStandaloneSettingsWindow(), []);
  const panelRef = useRef<HTMLDivElement>(null);
  useStandaloneWindowFit(hideOpenWindowCta, panelRef);

  useEffect(() => {
    void getLocalePreference().then(setLocalePref);
  }, []);

  useEffect(() => {
    void getSelectedTicker().then(setTicker);
  }, []);

  const m = useMemo(() => {
    return getMessages(effectiveLocale(localePref, detectLocale()));
  }, [localePref]);

  const cagr = getCagrDecimal(ticker);
  const demoPrice = 100;
  const demoFv = futureValue(demoPrice, cagr);

  return (
    <div
      ref={panelRef}
      className={`wvp-relative wvp-box-border wvp-min-w-[320px] wvp-max-w-[400px] wvp-overflow-hidden wvp-bg-[#0f0618] wvp-p-5 wvp-text-amber-50 ${
        hideOpenWindowCta ? "wvp-min-h-0" : "wvp-min-h-full"
      }`}
    >
      <div
        aria-hidden
        className="wvp-pointer-events-none wvp-absolute wvp-inset-0 wvp-bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(217,119,6,0.35),transparent_55%),radial-gradient(ellipse_90%_60%_at_100%_50%,rgba(168,85,247,0.2),transparent_50%),radial-gradient(ellipse_70%_50%_at_0%_100%,rgba(244,63,94,0.12),transparent_45%)]"
      />
      <div className="wvp-relative">
        <div className="wvp-mb-4 wvp-flex wvp-items-start wvp-justify-between wvp-gap-3">
          <div>
            <div className="wvp-text-[10px] wvp-font-semibold wvp-uppercase wvp-tracking-[0.22em] wvp-text-amber-400/90">
              Chrome Extension
            </div>
            <h1 className="wvp-mb-1 wvp-bg-gradient-to-r wvp-from-amber-200 wvp-via-orange-200 wvp-to-pink-200 wvp-bg-clip-text wvp-text-lg wvp-font-extrabold wvp-text-transparent">
              {m.popupTitle}
            </h1>
            <p className="wvp-m-0 wvp-text-[12px] wvp-leading-snug wvp-text-amber-200/80">
              {m.saveHint}
            </p>
          </div>
          <div className="wvp-rounded-2xl wvp-border wvp-border-amber-400/35 wvp-bg-gradient-to-br wvp-from-amber-500/25 wvp-to-fuchsia-600/25 wvp-p-2 wvp-text-amber-200 wvp-shadow-[0_0_28px_rgba(251,191,36,0.25)]">
            <Sparkles className="wvp-h-6 wvp-w-6" />
          </div>
        </div>

        <label className="wvp-mb-2 wvp-block wvp-text-[11px] wvp-font-semibold wvp-uppercase wvp-tracking-wide wvp-text-amber-300/90">
          {m.languageLabel}
        </label>
        <select
          className="wvp-mb-4 wvp-w-full wvp-cursor-pointer wvp-rounded-xl wvp-border-2 wvp-border-amber-400/35 wvp-bg-black/50 wvp-px-3 wvp-py-2.5 wvp-text-[13px] wvp-text-amber-50 wvp-outline-none wvp-shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] focus:wvp-border-amber-400/70 focus:wvp-shadow-[0_0_0_3px_rgba(251,191,36,0.25)]"
          value={localePref}
          onChange={(e) => {
            const next = e.target.value as LocalePreference;
            setLocalePref(next);
            void setLocalePreference(next);
          }}
        >
          {LOCALE_SELECT_OPTIONS.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              className="wvp-bg-neutral-900"
            >
              {opt.label}
            </option>
          ))}
        </select>

        <label className="wvp-mb-2 wvp-block wvp-text-[11px] wvp-font-semibold wvp-uppercase wvp-tracking-wide wvp-text-amber-300/90">
          {m.tickerLabel}
        </label>
        <select
          className="wvp-mb-4 wvp-w-full wvp-cursor-pointer wvp-rounded-xl wvp-border-2 wvp-border-fuchsia-400/30 wvp-bg-black/50 wvp-px-3 wvp-py-2.5 wvp-text-[13px] wvp-text-amber-50 wvp-outline-none wvp-shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] focus:wvp-border-fuchsia-400/60 focus:wvp-shadow-[0_0_0_3px_rgba(192,132,252,0.22)]"
          value={ticker}
          onChange={(e) => {
            const next = e.target.value;
            setTicker(next);
            void setSelectedTicker(next);
          }}
        >
          {TICKER_OPTIONS.map((sym) => (
            <option key={sym} value={sym} className="wvp-bg-neutral-900">
              {sym} · {formatPercent(getCagrDecimal(sym))} CAGR
            </option>
          ))}
        </select>

        {!hideOpenWindowCta ? (
          <>
            <button
              type="button"
              className="wvp-mb-3 wvp-flex wvp-w-full wvp-items-center wvp-justify-center wvp-gap-2 wvp-rounded-xl wvp-border-2 wvp-border-amber-300/50 wvp-bg-gradient-to-r wvp-from-amber-500/40 wvp-via-orange-500/35 wvp-to-rose-600/30 wvp-py-2.5 wvp-text-[13px] wvp-font-bold wvp-text-white wvp-shadow-[0_10px_28px_rgba(234,88,12,0.35)] wvp-outline-none hover:wvp-brightness-110 focus-visible:wvp-ring-2 focus-visible:wvp-ring-amber-200/80"
              onClick={() => {
                chrome.windows.create({
                  url: chrome.runtime.getURL("index.html?standalone=1"),
                  type: "popup",
                  width: 392,
                  height: 520,
                  focused: true,
                });
              }}
            >
              <ExternalLink className="wvp-h-4 wvp-w-4 wvp-shrink-0" />
              {m.openSeparateWindow}
            </button>
            <p className="wvp-mb-4 wvp-m-0 wvp-text-[11px] wvp-leading-snug wvp-text-amber-200/50">
              {m.openSeparateWindowHint}
            </p>
          </>
        ) : null}

        <div className="wvp-rounded-2xl wvp-border-2 wvp-border-amber-400/25 wvp-bg-gradient-to-br wvp-from-violet-950/80 wvp-to-fuchsia-950/70 wvp-p-3 wvp-shadow-[0_12px_36px_rgba(0,0,0,0.45)]">
          <div className="wvp-mb-2 wvp-flex wvp-items-center wvp-gap-2 wvp-text-[12px] wvp-font-semibold wvp-text-amber-200">
            {cagr < 0 ? (
              <TrendingDown className="wvp-h-4 wvp-w-4 wvp-text-emerald-300" />
            ) : (
              <TrendingUp className="wvp-h-4 wvp-w-4 wvp-text-amber-300" />
            )}
            <span>
              Demo · {formatPercent(cagr)} · {ticker}
            </span>
          </div>
          <p className="wvp-m-0 wvp-text-[12px] wvp-leading-relaxed wvp-text-amber-100/85">
            FV(10y) of {demoPrice} (units) ≈{" "}
            <span className="wvp-font-bold wvp-text-amber-200">
              {demoFv.toFixed(2)}
            </span>
          </p>
          <p className="wvp-mb-0 wvp-mt-2 wvp-text-[10px] wvp-text-fuchsia-200/45">
            {m.footnote}
          </p>
        </div>
      </div>
    </div>
  );
}
