(function initAcademyLensContentBackgroundClient(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  /** @type {any} */ (root).AcademyLensContentBackgroundClient = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function contentBackgroundClientFactory() {
  "use strict";

  const TIMEOUT_CODE = "ACADEMYLENS_BACKGROUND_TIMEOUT";

  function create(options = {}) {
    const chromeRef = options.chrome;
    const windowRef = options.window;
    const constants = options.constants;
    const createAbortError = options.createAbortError;
    if (!chromeRef || !chromeRef.runtime || !windowRef || !constants) {
      throw new Error("AcademyLensContentBackgroundClient requires chrome, window, and constants");
    }

    function cancel(operationId) {
      if (!operationId || !constants.MESSAGE_TYPES.CANCEL_TRANSLATION) return;
      chromeRef.runtime.sendMessage(
        { type: constants.MESSAGE_TYPES.CANCEL_TRANSLATION, operationId },
        () => void chromeRef.runtime.lastError
      );
    }

    function send(message, timeoutMs = 30000, signal) {
      return new Promise((resolve, reject) => {
        if (signal && signal.aborted) {
          reject(createAbortError());
          return;
        }

        let settled = false;
        let cleanup = () => {};
        const timeoutId = windowRef.setTimeout(() => {
          settled = true;
          cleanup();
          cancel(message && message.operationId);
          /** @type {Error & {code?: string}} */
          const error = new Error(constants.getMessage("status.timeout", options.uiLocale));
          error.code = TIMEOUT_CODE;
          reject(error);
        }, timeoutMs);

        const abort = () => {
          if (settled) return;
          settled = true;
          windowRef.clearTimeout(timeoutId);
          cleanup();
          cancel(message && message.operationId);
          reject(createAbortError());
        };
        if (signal) {
          signal.addEventListener("abort", abort, { once: true });
          cleanup = () => signal.removeEventListener("abort", abort);
        }

        chromeRef.runtime.sendMessage(message, (response) => {
          if (settled) return;
          settled = true;
          windowRef.clearTimeout(timeoutId);
          cleanup();
          const error = chromeRef.runtime.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve(response);
        });
      });
    }

    return Object.freeze({ send, cancel, timeoutCode: TIMEOUT_CODE });
  }

  return Object.freeze({ create, TIMEOUT_CODE });
});
