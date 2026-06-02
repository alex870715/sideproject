/**
 * MediaPipe 動態插入 <script> 時可能走 Document.prototype.createElement.call(document, …)。
 * 僅當 this===傳入的 doc 且為 <script> 時才包裝，避免影響一般網頁與其他擴充脈絡。
 * @param {Document} doc 通常為 Popup 的 document
 */
export function attachMediaPipeScriptElementFix(doc) {
  const shouldBeModule = (url) =>
    typeof url === 'string' && /_wasm_module_|wasm_module/.test(url);

  const POPUP_DOC = doc;
  const nativeCreateElement = Document.prototype.createElement;

  Document.prototype.createElement = function createElementScopedPatch(tagName, options) {
    const el = nativeCreateElement.call(this, tagName, options);

    const forPopupOnly =
      this === POPUP_DOC && String(tagName).toLowerCase() === 'script';

    if (!forPopupOnly) return el;

    const scriptEl = /** @type {HTMLScriptElement} */ (el);

    const origSetAttr = scriptEl.setAttribute.bind(scriptEl);
    scriptEl.setAttribute = function wrapAttr(name, value) {
      if (String(name).toLowerCase() === 'src' && shouldBeModule(String(value))) {
        scriptEl.type = 'module';
      }
      return origSetAttr(name, value);
    };

    Object.defineProperty(scriptEl, 'src', {
      configurable: true,
      enumerable: true,
      get() {
        return scriptEl.getAttribute('src') ?? '';
      },
      set(value) {
        if (shouldBeModule(String(value))) scriptEl.type = 'module';
        scriptEl.setAttribute('src', String(value));
      },
    });

    return scriptEl;
  };
}
