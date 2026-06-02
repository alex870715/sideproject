/** @param {unknown} err */
function readErrParts(err) {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return { name: err.name ?? '', message: err.message ?? '', code: err.code };
  }
  const o = /** @type {{ name?: string; message?: string }} */ (err);
  const messageRaw = o?.message ?? (typeof err === 'string' ? err : '');
  return {
    name: o?.name ?? '',
    message: typeof messageRaw === 'string' ? messageRaw : String(messageRaw),
    code: undefined,
  };
}

/** Service worker / Console 用，避免 DOMException 被印成 [object DOMException] */
export function formatErrorForLog(err) {
  const { name, message, code } = readErrParts(err);
  const core = [name, message].filter(Boolean).join(': ');
  if (core) return code !== undefined ? `${core} (code=${code})` : core;
  try {
    return String(err);
  } catch {
    return '[unknown error]';
  }
}

/** @param {unknown} err */
export function humanizeCameraOrWatchError(err) {
  const { name, message } = readErrParts(err);
  const msg = message;

  const permissionHit =
    name === 'NotAllowedError' ||
    /permission\s+dismissed|permission\s+denied|not\s+allowed/i.test(msg);

  if (permissionHit) {
    return (
      '相機權限被拒絕或已被你關閉（Permission dismissed／NotAllowed）。本擴充在 Popup 內請求鏡頭；請①再按「開始鏡頭偵測」並選「允許」②確認 macOS「系統設定 → 隱私權與安全性 → 相機」已勾選 Chrome／你的瀏覽器③Chrome「設定 → 隱私權 → 網站設定 → 相機」未被全面封鎖④必要時重新載入擴充。'
    );
  }

  if (name === 'NotFoundError' || /could not start.*video source|devices found/i.test(msg)) {
    return '找不到可用的視訊鏡頭（NotFound）。請確認鏡頭已連接且未被其他程式佔用。';
  }

  if (name === 'NotReadableError' || /could not start video source/i.test(msg)) {
    return '鏡頭無法開啟（可能被其他程式佔用或硬體異常）：NotReadableError。';
  }

  const summary = [name, msg].filter(Boolean).join(': ');
  return summary || formatErrorForLog(err);
}
