import { humanizeCameraOrWatchError } from './camera-errors.mjs';
import { attachMediaPipeScriptElementFix } from './mediapipe-createelement-fix.mjs';

attachMediaPipeScriptElementFix(document);

async function tabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

function sensitivityToThreshold(sliderVal) {
  const s = Number(sliderVal);
  return Math.max(0.045, 0.234 - (s / 100) * 0.174);
}

function showFaceStatus(text) {
  const el = document.getElementById('face-status');
  if (el) el.textContent = text ?? '';
}

/** @type {AbortController|null} */
let faceSession = null;

function stopLocalFaceSession() {
  faceSession?.abort();
  faceSession = null;
  const anchor = document.getElementById('camera-anchor');
  if (anchor) anchor.replaceChildren();
}

document.getElementById('panic-matrix').addEventListener('click', async () => {
  const id = await tabId();
  if (id !== undefined) {
    chrome.tabs.sendMessage(id, { type: 'BOSS_DEFENSE', mode: 'matrix' }).catch(() => {});
  }
});

document.getElementById('panic-grafana').addEventListener('click', async () => {
  const id = await tabId();
  if (id !== undefined) {
    chrome.tabs.sendMessage(id, { type: 'BOSS_DEFENSE', mode: 'grafana' }).catch(() => {});
  }
});

document.getElementById('calm').addEventListener('click', async () => {
  const id = await tabId();
  if (id !== undefined) {
    chrome.tabs.sendMessage(id, { type: 'BOSS_DEFENSE_CLEAR' }).catch(() => {});
  }
});

document.getElementById('audit').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RUN_NPM_AUDIT_PLACEHOLDER' });
});

async function startFaceWatch(mode) {
  stopLocalFaceSession();

  showFaceStatus('請求鏡頭…（請在本視窗允許）');
  const slider = document.getElementById('sensitivity');
  const proximityThreshold = sensitivityToThreshold(slider?.value ?? '52');

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch (e) {
    showFaceStatus(humanizeCameraOrWatchError(e));
    return;
  }

  const anchor = document.getElementById('camera-anchor');
  if (!anchor) {
    stream.getTracks().forEach((t) => t.stop());
    showFaceStatus('內部錯誤：缺少 camera-anchor');
    return;
  }

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  video.setAttribute(
    'style',
    'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;top:0;left:0;',
  );
  anchor.appendChild(video);

  try {
    await video.play();
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    anchor.replaceChildren();
    showFaceStatus(humanizeCameraOrWatchError(e));
    return;
  }

  faceSession = new AbortController();
  const signal = faceSession.signal;

  showFaceStatus('鏡頭已取得，載入偵測…（偵測中請勿關閉本 Popup）');

  try {
    const mod = await import('./face-detection-runner.mjs');
    await mod.runPopupFaceDetection(
      video,
      { mode, proximityThreshold, minConf: 0.52 },
      signal,
    );
  } catch {
    //
  } finally {
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        //
      }
    });
    video.srcObject = null;
    anchor.replaceChildren();
    faceSession = null;
  }
}

document.getElementById('face-start-matrix').addEventListener('click', () =>
  startFaceWatch('matrix'),
);
document.getElementById('face-start-grafana').addEventListener('click', () =>
  startFaceWatch('grafana'),
);

document.getElementById('face-stop').addEventListener('click', () => {
  showFaceStatus('停止中…');
  stopLocalFaceSession();
  showFaceStatus('已停止');
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'FACE_WATCH_STATUS') return;
  if (msg.phase === 'running')
    showFaceStatus(
      msg.backend === 'native'
        ? '偵測中（瀏覽器原生 FaceDetector）· 請勿關閉本視窗'
        : msg.backend === 'mediapipe'
          ? '偵測中（MediaPipe BlazeFace）· 請勿關閉本視窗'
          : '偵測中…',
    );
  if (msg.phase === 'error')
    showFaceStatus(`偵測錯誤：${msg.detail ?? 'unknown'}`);
});
