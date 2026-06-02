chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'RUN_NPM_AUDIT_PLACEHOLDER') {
    console.info('[Architect Overkill] 想像中：這裡在背景 terminal 跑了 npm audit。');
    return undefined;
  }

  if (msg?.type === 'BOSS_FACE_PROXIMITY' && typeof msg.mode === 'string') {
    broadcastDefense(msg.mode);
    return undefined;
  }

  return undefined;
});

async function broadcastDefense(mode) {
  const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
  for (const tab of tabs) {
    const u = tab.url ?? '';
    if (!tab.id || !/^https?:/i.test(u)) continue;
    chrome.tabs.sendMessage(tab.id, { type: 'BOSS_DEFENSE', mode }).catch(() => {});
  }
}
