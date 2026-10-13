(function initAcademyLensBrowserTranslator(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.AcademyLensBrowserTranslator = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function browserTranslatorFactory() {
  "use strict";

  const PROVIDER_ID = "browser-translator";
  const DEFAULT_SOURCE_LANGUAGE = "en";

  function translatorObject(scope) {
    return scope && scope.Translator;
  }

  function normalizeLanguage(code) {
    if (code === "iw") return "he";
    if (code === "zh-CN") return "zh";
    if (code === "zh-TW") return "zh-Hant";
    return String(code || "").trim();
  }

  function throwIfAborted(signal) {
    if (!signal || !signal.aborted) return;
    const error = new Error("Browser translation aborted");
    error.name = "AbortError";
    throw error;
  }

  function supportStatus(scope) {
    const Translator = translatorObject(scope);
    if (!Translator) return "unsupported";
    if (typeof Translator.availability !== "function" || typeof Translator.create !== "function") return "unsupported";
    return "supported";
  }

  async function availability(options = {}) {
    const scope = options.scope || globalThis;
    const sourceLanguage = normalizeLanguage(options.sourceLanguage || DEFAULT_SOURCE_LANGUAGE);
    const targetLanguage = normalizeLanguage(options.targetLanguage);
    const status = supportStatus(scope);

    if (status !== "supported") {
      return {
        provider: PROVIDER_ID,
        status,
        sourceLanguage,
        targetLanguage
      };
    }

    if (!targetLanguage || targetLanguage === sourceLanguage) {
      return {
        provider: PROVIDER_ID,
        status: "unavailable",
        sourceLanguage,
        targetLanguage
      };
    }

    try {
      const value = await translatorObject(scope).availability({ sourceLanguage, targetLanguage });
      return {
        provider: PROVIDER_ID,
        status: value || "unknown",
        sourceLanguage,
        targetLanguage
      };
    } catch (error) {
      return {
        provider: PROVIDER_ID,
        status: "error",
        sourceLanguage,
        targetLanguage,
        error: error && error.message ? error.message : String(error)
      };
    }
  }

  async function translateText(text, options = {}) {
    const value = String(text || "");
    const translated = await translateBatch([value], options);
    return translated[value];
  }

  async function translateBatch(texts, options = {}) {
    const signal = options.signal;
    throwIfAborted(signal);
    const scope = options.scope || globalThis;
    const sourceLanguage = normalizeLanguage(options.sourceLanguage || DEFAULT_SOURCE_LANGUAGE);
    const targetLanguage = normalizeLanguage(options.targetLanguage);
    const current = await availability({ scope, sourceLanguage, targetLanguage });
    throwIfAborted(signal);
    const allowedStatuses = options.allowDownload ? ["available", "downloadable", "downloading"] : ["available"];

    if (!allowedStatuses.includes(current.status)) {
      throw new Error(`Browser translator unavailable: ${current.status}`);
    }

    const translator = await translatorObject(scope).create({
      sourceLanguage,
      targetLanguage,
      ...(signal ? { signal } : {}),
      monitor(monitor) {
        if (!options.onDownloadProgress || !monitor || typeof monitor.addEventListener !== "function") return;
        monitor.addEventListener("downloadprogress", options.onDownloadProgress);
      }
    });

    let destroyed = false;
    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      if (translator && typeof translator.destroy === "function") translator.destroy();
    };
    if (signal) signal.addEventListener("abort", destroy, { once: true });

    try {
      throwIfAborted(signal);
      const translated = {};
      for (const text of texts || []) {
        throwIfAborted(signal);
        translated[text] = await translator.translate(String(text || ""), signal ? { signal } : {});
        throwIfAborted(signal);
      }
      return translated;
    } finally {
      if (signal) signal.removeEventListener("abort", destroy);
      destroy();
    }
  }

  return Object.freeze({
    PROVIDER_ID,
    availability,
    normalizeLanguage,
    supportStatus,
    translateBatch,
    translateText
  });
});
