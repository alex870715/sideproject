import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

/**
 * 獨立設定視窗（?standalone=1）：依內容收合視窗外框，並在版面變化時跟著調整。
 */
export function useStandaloneWindowFit(
  enabled: boolean,
  rootRef: RefObject<HTMLElement | null>,
): void {
  const debounceRef = useRef<number>();

  useEffect(() => {
    if (!enabled) return;
    const root = document.getElementById("root");
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlMin: html.style.minHeight,
      bodyMin: body.style.minHeight,
      rootMin: root?.style.minHeight ?? "",
    };
    html.style.minHeight = "0";
    body.style.minHeight = "0";
    if (root) root.style.minHeight = "0";
    return () => {
      html.style.minHeight = prev.htmlMin;
      body.style.minHeight = prev.bodyMin;
      if (root) root.style.minHeight = prev.rootMin;
    };
  }, [enabled]);

  useLayoutEffect(() => {
    if (!enabled) return;
    if (typeof chrome === "undefined" || !chrome.windows?.getCurrent) return;

    let cancelled = false;

    const apply = () => {
      if (cancelled) return;
      const el = rootRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const contentW = Math.ceil(Math.max(rect.width, el.scrollWidth));
      const contentH = Math.ceil(Math.max(rect.height, el.scrollHeight));

      const frameW = window.outerWidth - window.innerWidth;
      const frameH = window.outerHeight - window.innerHeight;
      const w = Math.min(
        Math.max(contentW + frameW, 320),
        screen.availWidth - 48,
      );
      const h = Math.min(
        Math.max(contentH + frameH, 360),
        screen.availHeight - 48,
      );

      chrome.windows.getCurrent((win) => {
        if (cancelled || win.id == null) return;
        if (win.width === w && win.height === h) return;
        chrome.windows.update(win.id, { width: w, height: h });
      });
    };

    const scheduleApply = () => {
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
      }
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = undefined;
        requestAnimationFrame(apply);
      }, 50);
    };

    scheduleApply();
    const ro = new ResizeObserver(scheduleApply);
    const el = rootRef.current;
    if (el) ro.observe(el);
    window.addEventListener("load", scheduleApply);

    return () => {
      cancelled = true;
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      ro.disconnect();
      window.removeEventListener("load", scheduleApply);
    };
  }, [enabled]);
}
