/**
 * 在 Popup 內執行人臉偵測（video 已由 Popup 取得 getUserMedia，才會有合法 user gesture）。
 */
import {
  FaceDetector as MpFaceDetector,
  FilesetResolver,
} from './vendor/vision_bundle.mjs';
import { humanizeCameraOrWatchError, formatErrorForLog } from './camera-errors.mjs';

const DEFAULT_COOLDOWN_MS = 14000;

let running = false;
/** @type {MpFaceDetector|null} */
let mpDetector = null;
/** @type {any} */
let nativeDetector = null;
/** @type {HTMLVideoElement|null} */
let videoElRef = null;
/** @type {number|null} */
let raf = null;
/** @type {'none'|'native'|'mediapipe'} */
let engineKind = 'none';
let nativeDetectBusy = false;

let proximityThreshold = 0.09;
/** @type {'matrix'|'grafana'} */
let overlayMode = 'matrix';
let consecutiveHits = 0;
let lastProxTrigger = 0;
let cooldownMs = DEFAULT_COOLDOWN_MS;

const REQUIRED_CONSEC_FRAMES = 10;

function getNativeFaceDetectorCtor() {
  return globalThis.FaceDetector;
}

function bumpProximity(maxArea, vw, vh) {
  const denom = vw * vh;
  const ratio = denom > 0 ? maxArea / denom : 0;

  if (ratio >= proximityThreshold) {
    consecutiveHits++;
  } else {
    consecutiveHits = 0;
  }

  if (
    consecutiveHits >= REQUIRED_CONSEC_FRAMES &&
    Date.now() - lastProxTrigger >= cooldownMs
  ) {
    lastProxTrigger = Date.now();
    consecutiveHits = 0;
    chrome.runtime.sendMessage({
      type: 'BOSS_FACE_PROXIMITY',
      mode: overlayMode,
      ratio,
    });
  }
}

function disposeDetectorsOnly() {
  running = false;
  consecutiveHits = 0;
  engineKind = 'none';
  nativeDetectBusy = false;

  if (raf != null) {
    cancelAnimationFrame(raf);
    raf = null;
  }

  nativeDetector = null;

  if (mpDetector) {
    try {
      mpDetector.close();
    } catch {
      //
    }
    mpDetector = null;
  }

  videoElRef = null;
}

/**
 * @param {HTMLVideoElement} videoEl 已接上 MediaStream 並可 play
 * @param {{ mode?: string; proximityThreshold?: number; minConf?: number; cooldownMs?: number }} opts
 * @param {AbortSignal} signal 取消時只做偵測清場；不關閉 MediaStream（由 Popup 負責）
 * @returns {Promise<void>}
 */
export function runPopupFaceDetection(videoEl, opts, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finishOk = () => {
      if (settled) return;
      settled = true;
      void disposeDetectorsOnly();
      resolve();
    };

    signal.addEventListener('abort', finishOk, { once: true });

    void (async () => {
      if (running) disposeDetectorsOnly();

      proximityThreshold =
        typeof opts.proximityThreshold === 'number' ? opts.proximityThreshold : 0.09;
      overlayMode = opts.mode === 'grafana' ? 'grafana' : 'matrix';
      cooldownMs = typeof opts.cooldownMs === 'number' ? opts.cooldownMs : DEFAULT_COOLDOWN_MS;

      running = true;
      consecutiveHits = 0;
      engineKind = 'none';
      videoElRef = videoEl;

      try {
        console.info('[BossDefense:PopupRunner] video 已就緒', {
          vw: videoEl.videoWidth,
          vh: videoEl.videoHeight,
        });

        const NativeCtor = getNativeFaceDetectorCtor();
        if (typeof NativeCtor === 'function') {
          try {
            nativeDetector = new NativeCtor({ fastMode: true, maxDetectedFaces: 3 });
            const probeMs = 3000;
            await Promise.race([
              nativeDetector.detect(videoEl),
              new Promise((_, rej) =>
                setTimeout(() => rej(new Error('native FaceDetector 逾時')), probeMs),
              ),
            ]);
            engineKind = 'native';
            console.info('[BossDefense:PopupRunner] native FaceDetector');
            runNativeLoop();
            chrome.runtime
              .sendMessage({ type: 'FACE_WATCH_STATUS', phase: 'running', backend: 'native' })
              .catch(() => {});
            return;
          } catch {
            nativeDetector = null;
            engineKind = 'none';
          }
        }

        console.info('[BossDefense:PopupRunner] MediaPipe BlazeFace');
        await startMediaPipeLoop(opts, videoEl);
        chrome.runtime
          .sendMessage({ type: 'FACE_WATCH_STATUS', phase: 'running', backend: 'mediapipe' })
          .catch(() => {});
      } catch (err) {
        if (settled || signal.aborted) return;
        settled = true;
        const detail = humanizeCameraOrWatchError(err);
        console.warn('[BossDefense:PopupRunner] error:', formatErrorForLog(err), err);
        chrome.runtime.sendMessage({
          type: 'FACE_WATCH_STATUS',
          phase: 'error',
          detail,
        }).catch(() => {});
      void disposeDetectorsOnly();
        reject(err);
      }
    })();
  });
}

function runNativeLoop() {
  const tick = () => {
    if (!running || !videoElRef || engineKind !== 'native') return;
    const vw = videoElRef.videoWidth;
    const vh = videoElRef.videoHeight;
    if (!vw || !vh || !nativeDetector) {
      raf = requestAnimationFrame(tick);
      return;
    }

    if (!nativeDetectBusy) {
      nativeDetectBusy = true;
      nativeDetector
        .detect(videoElRef)
        .then((/** @type {any[]} */ faces) => {
          nativeDetectBusy = false;
          if (!running || !videoElRef || engineKind !== 'native') return;

          let maxArea = 0;
          if (faces && faces.length) {
            for (const face of faces) {
              const b = face?.boundingBox;
              if (!b) continue;
              maxArea = Math.max(maxArea, b.width * b.height);
            }
          }
          bumpProximity(maxArea, vw, vh);
        })
        .catch(() => {
          nativeDetectBusy = false;
        });
    }

    raf = requestAnimationFrame(tick);
  };
  tick();
}

async function startMediaPipeLoop(opts, videoEl) {
  engineKind = 'mediapipe';
  const wasmRoot = chrome.runtime.getURL('vendor/mediapipe-wasm/');
  const modelUrl = chrome.runtime.getURL('models/blaze_face_short_range.tflite');

  try {
    const vision = await FilesetResolver.forVisionTasks(wasmRoot, false);
    mpDetector = await MpFaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelUrl,
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      minDetectionConfidence: typeof opts.minConf === 'number' ? opts.minConf : 0.55,
    });
  } catch (e) {
    throw new Error(`MediaPipe 初始化失敗：${String(e?.message ?? e)}`);
  }

  const tick = () => {
    if (!running || engineKind !== 'mediapipe' || !mpDetector || !videoEl) return;
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (!vw || !vh) {
      raf = requestAnimationFrame(tick);
      return;
    }

    let maxArea = 0;
    const result = mpDetector.detectForVideo(videoEl, performance.now());
    if (result?.detections) {
      for (const det of result.detections) {
        const b = det.boundingBox;
        if (!b) continue;
        maxArea = Math.max(maxArea, b.width * b.height);
      }
    }

    bumpProximity(maxArea, vw, vh);

    raf = requestAnimationFrame(tick);
  };
  tick();
}
