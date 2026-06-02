const OVERLAY_ID = 'architect-overkill-boss-defense-overlay';

function removeOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
}

function buildOverlay(theme) {
  removeOverlay();
  const el = document.createElement('div');
  el.id = OVERLAY_ID;
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    zIndex: String(2147483646),
    backgroundColor: 'rgb(0,0,0)',
    opacity: '1',
    color: theme === 'grafana' ? '#737373' : '#15803d',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    overflow: 'hidden',
    pointerEvents: 'none',
  });

  if (theme === 'grafana') {
    el.innerHTML = `
      <div style="padding:24px;display:grid;grid-template-columns:1fr 1fr;gap:12px;height:100%;box-sizing:border-box;background:#000;">
        ${Array.from({ length: 6 })
          .map(
            (_, i) => `
          <div style="border:1px solid #1f1f1f;border-radius:8px;padding:12px;background:#0a0a0a;">
            <div style="font-size:11px;color:#525252;margin-bottom:6px;">PANEL ${i + 1} · SLO LATENCY vs DREAM</div>
            <div style="height:72px;display:flex;align-items:flex-end;gap:3px;">
              ${Array.from({ length: 12 })
                .map(
                  () =>
                    `<span style="flex:1;height:${20 + Math.random() * 60}%;background:linear-gradient(180deg,#143333,#291064);opacity:1;border-radius:2px;"></span>`
                )
                .join('')}
            </div>
          </div>`
          )
          .join('')}
      </div>`;
  } else {
    el.innerHTML = `
      <div style="padding:24px;height:100%;box-sizing:border-box;background:#000;">
        <div style="opacity:1;font-size:13px;line-height:1.5;white-space:pre-wrap;color:#166534;" id="${OVERLAY_ID}-stream"></div>
      </div>`;
    streamMatrix(el.querySelector(`#${OVERLAY_ID}-stream`));
  }

  document.documentElement.appendChild(el);
}

function streamMatrix(target) {
  const cols = Math.floor(window.innerWidth / 14);
  const lines = Array.from({ length: 26 }, (_, r) =>
    Array.from({ length: cols }, () =>
      Math.random() < 0.12 ? String.fromCharCode(0x30a0 + Math.floor(Math.random() * 96)) : ' '
    ).join('')
  );
  target.textContent = lines.join('\n');
  let tick = 0;
  const id = setInterval(() => {
    if (!document.getElementById(OVERLAY_ID)) {
      clearInterval(id);
      return;
    }
    tick++;
    lines.shift();
    lines.push(
      Array.from({ length: cols }, (_, c) =>
        Math.random() < 0.08 + Math.sin((tick + c) / 5) * 0.03
          ? String.fromCharCode(0x30a0 + Math.floor(Math.random() * 96))
          : ' '
      ).join('')
    );
    const banner = `\nBUILD :: industrial-grade-happiness [████████░░] ${(tick % 97) + 3}%`;
    target.textContent = lines.join('\n') + banner;
  }, 90);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'BOSS_DEFENSE') {
    const theme = msg.mode === 'grafana' ? 'grafana' : 'matrix';
    buildOverlay(theme);
  }
  if (msg?.type === 'BOSS_DEFENSE_CLEAR') {
    removeOverlay();
  }
});
