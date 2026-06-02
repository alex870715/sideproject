/** 與 content script 相同的預設 Origin · Default origin shared with the content script */
const DEFAULT_ORIGIN = 'http://127.0.0.1:5173'

const originInput = document.getElementById('origin')
const saveBtn = document.getElementById('save')
const statusEl = document.getElementById('status')

if (!(originInput instanceof HTMLInputElement)) {
  throw new Error('找不到 #origin · missing #origin')
}
if (!(saveBtn instanceof HTMLButtonElement)) {
  throw new Error('找不到 #save · missing #save')
}

chrome.storage.sync.get(['appOrigin'], (r) => {
  originInput.value = (r.appOrigin || DEFAULT_ORIGIN).replace(/\/$/, '')
})

saveBtn.addEventListener('click', () => {
  const v = originInput.value.trim().replace(/\/$/, '') || DEFAULT_ORIGIN
  chrome.storage.sync.set({ appOrigin: v }, () => {
    if (statusEl) statusEl.textContent = '已儲存。 / Saved.'
  })
})
