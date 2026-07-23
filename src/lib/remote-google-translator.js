(function initAcademyLensRemoteGoogleTranslator(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.AcademyLensRemoteGoogleTranslator = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function remoteGoogleTranslatorFactory() {
  "use strict";

  const DEFAULT_RETRYABLE_STATUS = Object.freeze([408, 425, 429, 500, 502, 503, 504]);

  function defaultAbortError() {
    const error = new Error("Remote translation aborted");
    error.name = "AbortError";
    return error;
  }

  function positiveNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  }

  function retryCount(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
  }

  function create(options = {}) {
    const Cache = options.Cache;
    const GoogleTranslate = options.GoogleTranslate;
    const fetchImpl =
      options.fetchImpl || (typeof fetch === "function" ? (url, requestOptions) => fetch(url, requestOptions) : null);
    const setTimeoutImpl = options.setTimeoutImpl || setTimeout;
    const clearTimeoutImpl = options.clearTimeoutImpl || clearTimeout;
    const retryableStatus = new Set(options.retryableStatus || DEFAULT_RETRYABLE_STATUS);
    const createAbortError =
      typeof options.createAbortError === "function" ? options.createAbortError : defaultAbortError;
    const timeoutMs = positiveNumber(options.timeoutMs, 8000);
    const maxRetries = retryCount(options.maxRetries, 2);
    const baseBackoffMs = positiveNumber(options.baseBackoffMs, 350);
    const maxConcurrent = positiveNumber(options.maxConcurrent, 5);
    const random = typeof options.random === "function" ? options.random : Math.random;
    const inFlightTranslations = new Map();
    const fetchQueue = [];
    let activeFetches = 0;

    function assertReady() {
      if (!Cache || !GoogleTranslate || !fetchImpl) {
        throw new Error("Remote translator unavailable");
      }
    }

    function throwIfAborted(signal) {
      if (signal && signal.aborted) throw createAbortError();
    }

    function sleep(ms, signal) {
      return new Promise((resolve, reject) => {
        try {
          throwIfAborted(signal);
        } catch (error) {
          reject(error);
          return;
        }

        let settled = false;
        let cleanup = () => {};
        const timeoutId = setTimeoutImpl(() => {
          settled = true;
          cleanup();
          resolve();
        }, ms);

        const abort = () => {
          if (settled) return;
          settled = true;
          clearTimeoutImpl(timeoutId);
          cleanup();
          reject(createAbortError());
        };

        if (signal) {
          signal.addEventListener("abort", abort, { once: true });
          cleanup = () => signal.removeEventListener("abort", abort);
        }
      });
    }

    function drainFetchQueue() {
      while (activeFetches < maxConcurrent && fetchQueue.length > 0) {
        const next = fetchQueue.shift();
        next();
      }
    }

    function runWithFetchLimit(task, signal) {
      return new Promise((resolve, reject) => {
        try {
          throwIfAborted(signal);
        } catch (error) {
          reject(error);
          return;
        }

        let queued = false;
        let cleanup = () => {};
        const run = () => {
          queued = false;
          cleanup();
          try {
            throwIfAborted(signal);
          } catch (error) {
            reject(error);
            return;
          }

          activeFetches += 1;
          Promise.resolve()
            .then(task)
            .then(resolve, reject)
            .finally(() => {
              activeFetches -= 1;
              drainFetchQueue();
            });
        };

        if (activeFetches < maxConcurrent) {
          run();
          return;
        }

        queued = true;
        fetchQueue.push(run);
        if (signal) {
          const abort = () => {
            if (!queued) return;
            const index = fetchQueue.indexOf(run);
            if (index >= 0) fetchQueue.splice(index, 1);
            queued = false;
            cleanup();
            reject(createAbortError());
          };
          signal.addEventListener("abort", abort, { once: true });
          cleanup = () => signal.removeEventListener("abort", abort);
        }
      });
    }

    async function fetchWithRetry(text, targetLanguage, signal) {
      const url = GoogleTranslate.buildGoogleTranslateUrl(text, targetLanguage);
      let lastError = null;

      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        throwIfAborted(signal);
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (signal) signal.addEventListener("abort", abort, { once: true });
        const timeoutId = setTimeoutImpl(() => controller.abort(), timeoutMs);

        try {
          const response = await fetchImpl(url, { signal: controller.signal });
          if (response.ok) return response;

          lastError = new Error(`Google Translate request failed with ${response.status}`);
          lastError.retryable = retryableStatus.has(response.status);
          if (!lastError.retryable || attempt === maxRetries) throw lastError;
        } catch (error) {
          if (signal && signal.aborted) throw createAbortError();
          lastError = error;
          if (error.retryable === false || attempt === maxRetries) throw error;
        } finally {
          clearTimeoutImpl(timeoutId);
          if (signal) signal.removeEventListener("abort", abort);
        }

        throwIfAborted(signal);
        const jitter = Math.floor(random() * 120);
        await sleep(baseBackoffMs * 2 ** attempt + jitter, signal);
      }

      throw lastError || new Error("Google Translate request failed");
    }

    function translateText(text, targetLanguage, scope, signal) {
      assertReady();
      const key = Cache.cacheKey(targetLanguage, text, scope);
      const existing = inFlightTranslations.get(key);
      if (existing) return existing;

      const promise = runWithFetchLimit(async () => {
        const response = await fetchWithRetry(text, targetLanguage, signal);
        return GoogleTranslate.parseGoogleTranslatePayload(await response.json());
      }, signal).finally(() => {
        inFlightTranslations.delete(key);
      });

      inFlightTranslations.set(key, promise);
      return promise;
    }

    return Object.freeze({
      translateText
    });
  }

  return Object.freeze({
    create,
    defaultAbortError
  });
});
