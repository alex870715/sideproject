/**
 * 情緒化編譯：偵測「連續工作時間」（本機時間差）超過門檻後，
 * console、游標逃逸按鈕、頁面去彩度。
 *
 * 使用方式：
 *   import { attachEmotionalCompiler } from "./emotional-compiler.mjs";
 *   attachEmotionalCompiler({ workdayStartHour: 9, burnoutHours: 10 });
 */

const STORAGE_KEY_START = 'architect-overkill-work-start';

export function attachEmotionalCompiler(options = {}) {
  const burnoutMs = (options.burnoutHours ?? 10) * 60 * 60 * 1000;
  const degraded = () => elapsedWorkMs() >= burnoutMs;

  hijackConsole(burnoutMs);
  dodgeButtons(burnoutMs);
  applyGrayscaleWhenTired(degraded, burnoutMs);

  window.addEventListener('beforeunload', () => {
    if (!degraded()) {
      sessionStorage.setItem(STORAGE_KEY_START, String(workAnchor()));
    }
  });
}

function workAnchor() {
  const persisted = Number(sessionStorage.getItem(STORAGE_KEY_START));
  if (Number.isFinite(persisted) && persisted > 0) return persisted;
  const start = Date.now();
  sessionStorage.setItem(STORAGE_KEY_START, String(start));
  return start;
}

function elapsedWorkMs() {
  return Date.now() - workAnchor();
}

function hijackConsole(burnoutMs) {
  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  const tiredMessage = () => '去睡覺，我不跑了。';

  for (const key of Object.keys(orig)) {
    console[key] = (...args) => {
      if (elapsedWorkMs() >= burnoutMs) {
        orig[key](tiredMessage());
        return;
      }
      orig[key](...args);
    };
  }
}

function dodgeButtons(burnoutMs) {
  document.querySelectorAll('button, [role="button"]').forEach((btn) => {
    btn.addEventListener(
      'mouseenter',
      () => {
        if (elapsedWorkMs() < burnoutMs) return;
        const jitter = () => `${(Math.random() - 0.5) * 120}px`;
        btn.style.transition = 'transform 120ms ease-out';
        btn.style.transform = `translate(${jitter()}, ${jitter()})`;
      },
      { passive: true }
    );
  });
}

function applyGrayscaleWhenTired(isTiredFn, burnoutMs) {
  const rampEnd = burnoutMs + 60 * 60 * 1000;
  const step = () => {
    const ramp = rampEnd > burnoutMs ? (elapsedWorkMs() - burnoutMs) / (rampEnd - burnoutMs) : 1;
    const t = Math.min(1, Math.max(0, ramp));
    document.documentElement.style.filter =
      isTiredFn() ? `grayscale(${Math.round(t * 100)}%) contrast(96%)` : '';
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
