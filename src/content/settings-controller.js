(function initAcademyLensSettingsController(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  /** @type {any} */ (root).AcademyLensSettingsController = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function settingsControllerFactory() {
  "use strict";

  function create(options = {}) {
    const chromeRef = options.chrome;
    const constants = options.constants;
    const navigatorRef = options.navigator;
    const cacheEpochValue = options.cacheEpochValue || ((value) => Number(value) || 0);
    if (!chromeRef || !constants || !navigatorRef) {
      throw new Error("AcademyLensSettingsController requires chrome, constants, and navigator");
    }

    function normalize(settings = {}) {
      const normalized = { ...constants.DEFAULT_SETTINGS, ...settings };
      normalized.targetLanguage = constants.matchSupportedLanguage(normalized.targetLanguage);
      if (!normalized.targetLanguage) {
        normalized.targetLanguage = constants.resolveDefaultTargetLanguage(
          Array.isArray(navigatorRef.languages) && navigatorRef.languages.length
            ? navigatorRef.languages
            : [navigatorRef.language]
        );
      }
      normalized.translationEngine = constants.normalizeTranslationEngine(normalized.translationEngine);
      normalized.ollamaModel = constants.normalizeOllamaModel(normalized.ollamaModel);
      return normalized;
    }

    async function load() {
      const stored = await chromeRef.storage.local.get([constants.STORAGE_KEYS.SETTINGS]);
      const storedSettings = stored[constants.STORAGE_KEYS.SETTINGS] || {};
      const settings = normalize(storedSettings);
      if (
        settings.targetLanguage !== storedSettings.targetLanguage ||
        settings.translationEngine !== storedSettings.translationEngine ||
        settings.ollamaModel !== storedSettings.ollamaModel
      ) {
        await chromeRef.storage.local.set({ [constants.STORAGE_KEYS.SETTINGS]: settings });
      }
      return settings;
    }

    let listener = null;
    function start(handlers = {}) {
      if (listener) return;
      listener = (changes, areaName) => {
        if (areaName !== "local") return;
        if (changes[constants.STORAGE_KEYS.CACHE_EPOCH] && handlers.onCacheEpoch) {
          handlers.onCacheEpoch(cacheEpochValue(changes[constants.STORAGE_KEYS.CACHE_EPOCH].newValue));
        }
        if (changes[constants.STORAGE_KEYS.SETTINGS] && handlers.onSettings) {
          handlers.onSettings(normalize(changes[constants.STORAGE_KEYS.SETTINGS].newValue));
        }
      };
      chromeRef.storage.onChanged.addListener(listener);
    }

    function stop() {
      if (!listener) return;
      if (chromeRef.storage.onChanged.removeListener) chromeRef.storage.onChanged.removeListener(listener);
      listener = null;
    }

    return Object.freeze({ load, normalize, start, stop });
  }

  return Object.freeze({ create });
});
