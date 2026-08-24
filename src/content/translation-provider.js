(function initAcademyLensTranslationProvider(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  /** @type {any} */ (root).AcademyLensTranslationProvider = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function translationProviderFactory() {
  "use strict";

  function create(options = {}) {
    const C = options.constants;
    const Cache = options.Cache;
    const BrowserTranslator = options.BrowserTranslator;
    const GoogleTranslate = options.GoogleTranslate;
    const backgroundClient = options.backgroundClient;
    const getSettings = options.getSettings;
    const getCacheEpoch = options.getCacheEpoch;
    const getLocal = options.getLocal;
    const cacheEpochValue = options.cacheEpochValue;
    const cacheHasTranslation = options.cacheHasTranslation;
    const cacheUpdateMeta = options.cacheUpdateMeta;
    const translateTextInContent = options.translateTextInContent;
    const throwIfAborted = options.throwIfAborted;
    const persistContentCache = options.persistContentCache;
    const setBrowserTranslatorStatus = options.setBrowserTranslatorStatus;
    const updateProviderModeFromBrowserStatus = options.updateProviderModeFromBrowserStatus;
    const setProviderMode = options.setProviderMode;
    const translationLooksSuspicious = options.translationLooksSuspicious;
    const message = options.message;
    const untranslatedTexts = options.untranslatedTexts;
    const mergeTranslationResponses = options.mergeTranslationResponses;
    const responseTimeoutMs = options.responseTimeoutMs || 12000;
    const maxResponseTimeoutMs = options.maxResponseTimeoutMs || 300000;

    async function translateBatchInContent(texts, targetLanguage, scope = {}, expectedEpoch = getCacheEpoch(), signal) {
      if (!Cache || !GoogleTranslate || typeof fetch !== "function") throw new Error(message("status.failed"));
      throwIfAborted(signal);
      const stored = await getLocal([C.STORAGE_KEYS.CACHE, C.STORAGE_KEYS.CACHE_EPOCH]);
      const currentEpoch = cacheEpochValue(stored[C.STORAGE_KEYS.CACHE_EPOCH]);
      const cache = cacheEpochValue(expectedEpoch) === currentEpoch ? stored[C.STORAGE_KEYS.CACHE] || {} : {};
      const translated = {};
      const errors = {};
      const cacheUpdates = {};
      const stats = {
        cacheHits: 0,
        cacheMisses: 0,
        failed: 0,
        requested: texts.length,
        fallback: true,
        cachePersistFailed: false
      };
      await Promise.all(
        texts.map(async (text) => {
          const key = Cache.cacheKey(targetLanguage, text, scope);
          if (cacheHasTranslation(cache, key, text, targetLanguage, scope)) {
            translated[text] = cache[key].translated;
            cacheUpdates[key] = {
              original: text,
              targetLanguage,
              ...cacheUpdateMeta(scope),
              accessedAt: Date.now()
            };
            stats.cacheHits += 1;
            return;
          }
          stats.cacheMisses += 1;
          try {
            const result = await translateTextInContent(text, targetLanguage, scope, signal);
            throwIfAborted(signal);
            translated[text] = result;
            cacheUpdates[key] = {
              original: text,
              translated: result,
              targetLanguage,
              ...cacheUpdateMeta(scope),
              createdAt: Date.now(),
              accessedAt: Date.now()
            };
          } catch (error) {
            stats.failed += 1;
            errors[text] = error.message || String(error);
          }
        })
      );
      const persisted = await persistContentCache(cacheUpdates, expectedEpoch, signal);
      if (!persisted && Object.keys(cacheUpdates).length) stats.cachePersistFailed = true;
      return { ok: Object.keys(translated).length > 0 || texts.length === 0, translated, errors, stats };
    }

    async function translateBatchWithBrowserTranslator(
      texts,
      targetLanguage,
      scope = {},
      expectedEpoch = getCacheEpoch(),
      signal
    ) {
      if (
        !Cache ||
        !BrowserTranslator ||
        typeof BrowserTranslator.availability !== "function" ||
        typeof BrowserTranslator.translateBatch !== "function"
      ) {
        return null;
      }
      const requestedTexts = Array.isArray(texts) ? texts : [];
      const stats = {
        cacheHits: 0,
        cacheMisses: 0,
        failed: 0,
        requested: requestedTexts.length,
        provider: BrowserTranslator.PROVIDER_ID || "browser-translator",
        cachePersistFailed: false
      };
      if (!requestedTexts.length) return { ok: true, translated: {}, errors: {}, stats };
      try {
        throwIfAborted(signal);
        const support = await BrowserTranslator.availability({ sourceLanguage: "en", targetLanguage });
        throwIfAborted(signal);
        setBrowserTranslatorStatus(support.status);
        const settings = getSettings();
        const canUse =
          support.status === "available" ||
          (settings.enableBrowserTranslatorDownloads &&
            (support.status === "downloadable" || support.status === "downloading"));
        if (!canUse) {
          updateProviderModeFromBrowserStatus(support.status);
          return null;
        }
        setProviderMode(support.status === "available" ? "native" : "nativeDownloading");
        const stored = await getLocal([C.STORAGE_KEYS.CACHE, C.STORAGE_KEYS.CACHE_EPOCH]);
        const currentEpoch = cacheEpochValue(stored[C.STORAGE_KEYS.CACHE_EPOCH]);
        const cache = cacheEpochValue(expectedEpoch) === currentEpoch ? stored[C.STORAGE_KEYS.CACHE] || {} : {};
        const translated = {};
        const errors = {};
        const cacheUpdates = {};
        const browserTexts = [];
        for (const text of requestedTexts) {
          const key = Cache.cacheKey(targetLanguage, text, scope);
          if (cacheHasTranslation(cache, key, text, targetLanguage, scope)) {
            translated[text] = cache[key].translated;
            cacheUpdates[key] = {
              original: text,
              targetLanguage,
              ...cacheUpdateMeta(scope),
              accessedAt: Date.now()
            };
            stats.cacheHits += 1;
          } else {
            stats.cacheMisses += 1;
            browserTexts.push(text);
          }
        }
        if (browserTexts.length) {
          throwIfAborted(signal);
          const browserTranslations = await BrowserTranslator.translateBatch(browserTexts, {
            sourceLanguage: "en",
            targetLanguage,
            allowDownload: Boolean(settings.enableBrowserTranslatorDownloads),
            onDownloadProgress() {
              setBrowserTranslatorStatus("downloading");
              setProviderMode("nativeDownloading");
            }
          });
          throwIfAborted(signal);
          for (const text of browserTexts) {
            const result = browserTranslations ? browserTranslations[text] : "";
            if (translationLooksSuspicious(text, result, targetLanguage)) {
              stats.failed += 1;
              errors[text] = message("status.failed");
            } else {
              translated[text] = result;
              cacheUpdates[Cache.cacheKey(targetLanguage, text, scope)] = {
                original: text,
                translated: result,
                targetLanguage,
                ...cacheUpdateMeta(scope),
                createdAt: Date.now(),
                accessedAt: Date.now()
              };
            }
          }
        }
        const persisted = await persistContentCache(cacheUpdates, expectedEpoch, signal);
        if (!persisted && Object.keys(cacheUpdates).length) stats.cachePersistFailed = true;
        return { ok: stats.failed === 0 || Object.keys(translated).length > 0, translated, errors, stats };
      } catch (error) {
        console.warn("[AcademyLens] browser translator unavailable; trying background translation", error);
        return null;
      }
    }

    function emptyTranslationResponse(requestedTexts) {
      return {
        ok: false,
        translated: {},
        errors: requestedTexts.reduce((errors, text) => {
          errors[text] = "engine-disallowed";
          return errors;
        }, {}),
        stats: { hits: 0, misses: 0, fallbackTexts: 0 }
      };
    }

    async function sendBackgroundTranslationBatch(payload, timeoutMs, signal) {
      throwIfAborted(signal);
      const usesOllama = C.engineUsesOllama(payload.translationEngine);
      setProviderMode(usesOllama ? "ollama" : "background", usesOllama ? payload.ollamaModel : "");
      const fallbackScope = { ...((payload && payload.cacheScope) || {}), provider: "google-translate" };
      const requestedTimeout = Number(timeoutMs) || responseTimeoutMs;
      const backgroundTimeout = Math.max(responseTimeoutMs, Math.min(requestedTimeout, maxResponseTimeoutMs));
      try {
        const response = await backgroundClient.send(payload, backgroundTimeout, signal);
        if (response && response.ok) return response;
        if (response && response.translated && Object.keys(response.translated).length) return response;
        if (usesOllama) return response || emptyTranslationResponse(payload.texts || []);
      } catch (error) {
        if (usesOllama) throw error;
        if (error && error.code === backgroundClient.timeoutCode) throw error;
        console.warn("[AcademyLens] background translation unavailable; trying content fallback", error);
      }
      setProviderMode("fallback");
      return translateBatchInContent(
        payload.texts || [],
        payload.targetLanguage,
        fallbackScope,
        payload.cacheEpoch,
        signal
      );
    }

    async function sendTranslationBatch(payload, timeoutMs, signal) {
      throwIfAborted(signal);
      const requestedTexts = payload.texts || [];
      const settings = getSettings();
      const engine = C.normalizeTranslationEngine(settings.translationEngine);
      const allowRemote = C.engineAllowsRemote(engine);
      const preferDevice = C.enginePrefersDevice(engine);
      if (C.engineUsesOllama(engine)) {
        return sendBackgroundTranslationBatch(
          { ...payload, translationEngine: engine, ollamaModel: C.normalizeOllamaModel(settings.ollamaModel) },
          Math.max(Number(timeoutMs) || 0, 240000),
          signal
        );
      }
      if (!preferDevice) {
        return allowRemote
          ? sendBackgroundTranslationBatch(payload, timeoutMs, signal)
          : emptyTranslationResponse(requestedTexts);
      }
      const nativeScope = {
        ...((payload && payload.cacheScope) || {}),
        provider:
          BrowserTranslator && BrowserTranslator.PROVIDER_ID ? BrowserTranslator.PROVIDER_ID : "browser-translator"
      };
      const browserResponse = await translateBatchWithBrowserTranslator(
        requestedTexts,
        payload.targetLanguage,
        nativeScope,
        payload.cacheEpoch,
        signal
      );
      if (browserResponse) {
        const missingTexts = untranslatedTexts(requestedTexts, browserResponse);
        if (!missingTexts.length || !allowRemote) {
          return mergeTranslationResponses(browserResponse, null, requestedTexts);
        }
        throwIfAborted(signal);
        const fallbackResponse = await sendBackgroundTranslationBatch(
          { ...payload, texts: missingTexts },
          timeoutMs,
          signal
        );
        return mergeTranslationResponses(browserResponse, fallbackResponse, requestedTexts);
      }
      return allowRemote
        ? sendBackgroundTranslationBatch(payload, timeoutMs, signal)
        : emptyTranslationResponse(requestedTexts);
    }

    return Object.freeze({ sendTranslationBatch });
  }

  return Object.freeze({ create });
});
