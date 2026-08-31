try {
  importScripts(
    "../lib/constants.js",
    "../lib/cache.js",
    "../lib/translation-quality.js",
    "../lib/google-translate.js",
    "../lib/remote-google-translator.js",
    "../lib/ollama-translator.js"
  );
} catch (error) {
  console.warn("[AcademyLens] library fallback", error);
}

const {
  MESSAGE_TYPES,
  STORAGE_KEYS,
  LIMITS,
  REMOTE_TRANSLATION_ORIGIN,
  OLLAMA_ORIGIN,
  TRANSLATION_ENGINES,
  normalizeTranslationEngine,
  normalizeOllamaModel
} = self.AcademyLensConstants || {
  MESSAGE_TYPES: {
    TRANSLATE_BATCH: "ACADEMYLENS_TRANSLATE_BATCH",
    CANCEL_TRANSLATION: "ACADEMYLENS_CANCEL_TRANSLATION",
    CHECK_OLLAMA: "ACADEMYLENS_CHECK_OLLAMA",
    PERSIST_CACHE_UPDATES: "ACADEMYLENS_PERSIST_CACHE_UPDATES",
    CLEAR_CACHE: "ACADEMYLENS_CLEAR_CACHE"
  },
  STORAGE_KEYS: {
    SETTINGS: "academylens.settings",
    CACHE: "academylens.translationCache.v1",
    CACHE_EPOCH: "academylens.translationCacheEpoch.v1"
  },
  LIMITS: { cacheEntries: 600 },
  REMOTE_TRANSLATION_ORIGIN: "https://translate.googleapis.com/*",
  OLLAMA_ORIGIN: "http://localhost:11434/*",
  TRANSLATION_ENGINES: { REMOTE: "remote", OLLAMA: "ollama" },
  normalizeTranslationEngine: (value) => (value === "remote" || value === "ollama" ? value : "device"),
  normalizeOllamaModel: (value) => value || "qwen3.5:4b"
};

const Cache = self.AcademyLensCache;
const TranslationQuality = self.AcademyLensTranslationQuality;
const GoogleTranslate = self.AcademyLensGoogleTranslate;
const RemoteGoogleTranslator = self.AcademyLensRemoteGoogleTranslator;
const OllamaTranslator = self.AcademyLensOllamaTranslator;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const FETCH_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 350;
const MAX_CONCURRENT_REMOTE_FETCHES = 5;

let cacheWriteChain = Promise.resolve();
const activeOperations = new Map();
const remoteTranslator =
  RemoteGoogleTranslator && RemoteGoogleTranslator.create
    ? RemoteGoogleTranslator.create({
        Cache,
        GoogleTranslate,
        fetchImpl: (url, options) => fetch(url, options),
        setTimeoutImpl: setTimeout,
        clearTimeoutImpl: clearTimeout,
        retryableStatus: RETRYABLE_STATUS,
        timeoutMs: FETCH_TIMEOUT_MS,
        maxRetries: MAX_RETRIES,
        baseBackoffMs: BASE_BACKOFF_MS,
        maxConcurrent: MAX_CONCURRENT_REMOTE_FETCHES
      })
    : null;
const ollamaTranslator =
  OllamaTranslator && OllamaTranslator.create
    ? OllamaTranslator.create({
        fetchImpl: (url, options) => fetch(url, options),
        setTimeoutImpl: setTimeout,
        clearTimeoutImpl: clearTimeout,
        timeoutMs: 240000
      })
    : null;

function getLocal(keys) {
  return chrome.storage.local.get(keys);
}

function setLocal(values) {
  return chrome.storage.local.set(values);
}

function cacheEpochValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function googleCacheScope(message) {
  return {
    ...((message && message.cacheScope) || {}),
    provider: "google-translate"
  };
}

function ollamaCacheScope(message, model) {
  return {
    ...((message && message.cacheScope) || {}),
    provider: `ollama-${model}`
  };
}

// The remote Google Translate host is an optional permission, so the service
// worker verifies the grant itself rather than trusting the calling frame.
async function hasOriginPermission(origin) {
  if (!chrome.permissions || typeof chrome.permissions.contains !== "function") return false;
  try {
    return await chrome.permissions.contains({ origins: [origin] });
  } catch (error) {
    console.warn("[AcademyLens] remote permission check failed", error);
    return false;
  }
}

function remoteTranslate(text, targetLanguage, scope, signal) {
  if (!remoteTranslator) throw new Error("Remote translator unavailable");
  return remoteTranslator.translateText(text, targetLanguage, scope, signal);
}

function ollamaTranslate(text, targetLanguage, model, signal) {
  if (!ollamaTranslator) throw new Error("Ollama translator unavailable");
  return ollamaTranslator.translateText(text, targetLanguage, model, signal);
}

function ollamaTranslateBatch(texts, targetLanguage, model, signal) {
  if (!ollamaTranslator) throw new Error("Ollama translator unavailable");
  if (typeof ollamaTranslator.translateTexts !== "function") {
    return Promise.all(texts.map((text) => ollamaTranslate(text, targetLanguage, model, signal)));
  }
  return ollamaTranslator.translateTexts(texts, targetLanguage, model, signal);
}

function withCacheWriteLock(task) {
  const nextWrite = cacheWriteChain.then(task, task);
  cacheWriteChain = nextWrite.catch(() => {});
  return nextWrite;
}

async function mergeCacheUpdates(cacheUpdates, expectedEpoch) {
  if (!Object.keys(cacheUpdates).length) return { persisted: true };

  try {
    await withCacheWriteLock(async () => {
      const stored = await getLocal([STORAGE_KEYS.CACHE, STORAGE_KEYS.CACHE_EPOCH]);
      const currentEpoch = cacheEpochValue(stored[STORAGE_KEYS.CACHE_EPOCH]);
      if (expectedEpoch !== undefined && cacheEpochValue(expectedEpoch) !== currentEpoch) {
        return;
      }
      const cache = stored[STORAGE_KEYS.CACHE] || {};
      for (const [key, update] of Object.entries(cacheUpdates)) {
        const existing = cache[key];
        if (update.translated) {
          cache[key] = {
            ...existing,
            ...update
          };
        } else if (
          existing &&
          existing.original === update.original &&
          existing.targetLanguage === update.targetLanguage
        ) {
          cache[key] = {
            ...existing,
            accessedAt: update.accessedAt
          };
        }
      }
      await setLocal({ [STORAGE_KEYS.CACHE]: Cache.trimCache(cache, LIMITS.cacheEntries) });
    });
    return { persisted: true };
  } catch (error) {
    console.warn("[AcademyLens] translation cache persistence failed", error);
    return { persisted: false, error: error.message || String(error) };
  }
}

async function translateBatch(message, signal) {
  const targetLanguage = message.targetLanguage;
  if (!targetLanguage) {
    return { ok: false, translated: {}, errors: {}, error: "No target language selected" };
  }
  const engine = message.translationEngine;
  if (engine !== TRANSLATION_ENGINES.REMOTE && engine !== TRANSLATION_ENGINES.OLLAMA) {
    return { ok: false, translated: {}, errors: {}, error: "Explicit remote translation engine required" };
  }
  const usesOllama = engine === TRANSLATION_ENGINES.OLLAMA;
  const settingsState = await getLocal([STORAGE_KEYS.SETTINGS]);
  const selectedSettings = settingsState[STORAGE_KEYS.SETTINGS] || {};
  const selectedEngine = normalizeTranslationEngine(selectedSettings.translationEngine);
  if (selectedEngine !== engine) {
    return { ok: false, translated: {}, errors: {}, error: "Request does not match the selected translation engine" };
  }
  const ollamaModel = normalizeOllamaModel(message.ollamaModel);
  if (usesOllama && normalizeOllamaModel(selectedSettings.ollamaModel) !== ollamaModel) {
    return { ok: false, translated: {}, errors: {}, error: "Request does not match the selected Ollama model" };
  }
  const permissionOrigin = usesOllama ? OLLAMA_ORIGIN : REMOTE_TRANSLATION_ORIGIN;
  if (!(await hasOriginPermission(permissionOrigin))) {
    return {
      ok: false,
      translated: {},
      errors: {},
      error: usesOllama ? "Ollama localhost permission not granted" : "Remote translation permission not granted"
    };
  }
  const cacheScope = usesOllama ? ollamaCacheScope(message, ollamaModel) : googleCacheScope(message);
  const allTexts = Array.isArray(message.texts)
    ? [...new Set(message.texts.map((text) => String(text)).filter(Boolean))]
    : [];
  const texts = allTexts.slice(0, LIMITS.maxBatchSize || 40);
  const stored = await getLocal([STORAGE_KEYS.CACHE, STORAGE_KEYS.CACHE_EPOCH]);
  const cacheEpoch = cacheEpochValue(stored[STORAGE_KEYS.CACHE_EPOCH]);
  const expectedCacheEpoch = message.cacheEpoch === undefined ? cacheEpoch : cacheEpochValue(message.cacheEpoch);
  const cache = expectedCacheEpoch === cacheEpoch ? stored[STORAGE_KEYS.CACHE] || {} : {};
  const translated = {};
  const errors = {};
  const cacheUpdates = {};
  const stats = {
    cacheHits: 0,
    cacheMisses: 0,
    failed: 0,
    requested: texts.length,
    truncated: Math.max(0, allTexts.length - texts.length),
    cachePersistFailed: false
  };

  const cacheMisses = [];
  function recordTranslation(text, result) {
    const key = Cache.cacheKey(targetLanguage, text, cacheScope);
    translated[text] = result;
    cacheUpdates[key] = {
      original: text,
      translated: result,
      targetLanguage,
      ...Cache.normalizeScope(cacheScope),
      createdAt: Date.now(),
      accessedAt: Date.now()
    };
  }

  for (const text of texts) {
    const key = Cache.cacheKey(targetLanguage, text, cacheScope);
    if (Cache.entryMatches(cache[key], text, targetLanguage, cacheScope)) {
      translated[text] = cache[key].translated;
      cacheUpdates[key] = {
        original: text,
        targetLanguage,
        ...Cache.normalizeScope(cacheScope),
        accessedAt: Date.now()
      };
      stats.cacheHits += 1;
      continue;
    }
    stats.cacheMisses += 1;
    cacheMisses.push(text);
  }

  if (usesOllama && cacheMisses.length) {
    try {
      const results = await ollamaTranslateBatch(cacheMisses, targetLanguage, ollamaModel, signal);
      if (results.length !== cacheMisses.length) throw new Error("Ollama returned a mismatched translation batch");
      for (let index = 0; index < cacheMisses.length; index += 1) {
        const text = cacheMisses[index];
        let result = results[index];
        let quality = TranslationQuality.validate(text, result, targetLanguage);
        if (!quality.ok) {
          try {
            [result] = await ollamaTranslateBatch([text], targetLanguage, ollamaModel, signal);
            quality = TranslationQuality.validate(text, result, targetLanguage);
          } catch (error) {
            if (error && error.name === "AbortError") throw error;
            quality = { ok: false, issue: error.message || String(error) };
          }
        }
        if (quality.ok) {
          recordTranslation(text, result);
        } else {
          stats.failed += 1;
          errors[text] = `Ollama translation quality check failed: ${quality.issue}`;
        }
      }
    } catch (error) {
      for (const text of cacheMisses) {
        stats.failed += 1;
        errors[text] = error.message || String(error);
      }
    }
  } else if (cacheMisses.length) {
    await Promise.all(
      cacheMisses.map(async (text) => {
        try {
          const result = await remoteTranslate(text, targetLanguage, cacheScope, signal);
          recordTranslation(text, result);
        } catch (error) {
          stats.failed += 1;
          errors[text] = error.message || String(error);
        }
      })
    );
  }

  const cacheResult = await mergeCacheUpdates(cacheUpdates, expectedCacheEpoch);
  if (!cacheResult.persisted) {
    stats.cachePersistFailed = true;
  }

  return {
    ok: Object.keys(translated).length > 0 || texts.length === 0,
    translated,
    errors,
    stats
  };
}

function operationId(value) {
  return String(value || "")
    .trim()
    .slice(0, 160);
}

async function checkOllama(message) {
  const model = normalizeOllamaModel(message && message.ollamaModel);
  const settingsState = await getLocal([STORAGE_KEYS.SETTINGS]);
  const selectedSettings = settingsState[STORAGE_KEYS.SETTINGS] || {};
  if (
    normalizeTranslationEngine(selectedSettings.translationEngine) !== TRANSLATION_ENGINES.OLLAMA ||
    normalizeOllamaModel(selectedSettings.ollamaModel) !== model
  ) {
    return { ok: false, status: "selection-mismatch", model, models: [] };
  }
  if (!(await hasOriginPermission(OLLAMA_ORIGIN))) {
    return { ok: false, status: "permission-denied", models: [] };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch("http://localhost:11434/api/tags", { signal: controller.signal });
    if (!response.ok) return { ok: false, status: "offline", models: [] };
    const payload = await response.json();
    const models = Array.isArray(payload.models)
      ? payload.models
          .map((item) => String(item && (item.name || item.model) ? item.name || item.model : ""))
          .filter(Boolean)
      : [];
    const installed = models.includes(model);
    return { ok: installed, status: installed ? "ready" : "model-missing", model, models };
  } catch {
    return { ok: false, status: "offline", models: [] };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function persistCacheUpdates(message) {
  return mergeCacheUpdates(message.cacheUpdates || {}, message.expectedCacheEpoch);
}

async function clearTranslationCache() {
  return withCacheWriteLock(async () => {
    const stored = await getLocal([STORAGE_KEYS.CACHE_EPOCH]);
    const nextEpoch = cacheEpochValue(stored[STORAGE_KEYS.CACHE_EPOCH]) + 1;
    await setLocal({
      [STORAGE_KEYS.CACHE]: {},
      [STORAGE_KEYS.CACHE_EPOCH]: nextEpoch
    });
    return { cleared: true, cacheEpoch: nextEpoch };
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return false;

  if (message.type === MESSAGE_TYPES.PERSIST_CACHE_UPDATES) {
    persistCacheUpdates(message)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({ persisted: false, error: error.message || String(error) });
      });

    return true;
  }

  if (message.type === MESSAGE_TYPES.CLEAR_CACHE) {
    clearTranslationCache()
      .then(sendResponse)
      .catch((error) => {
        sendResponse({ cleared: false, error: error.message || String(error) });
      });

    return true;
  }

  if (message.type === MESSAGE_TYPES.CHECK_OLLAMA) {
    checkOllama(message)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, status: "offline", models: [] }));
    return true;
  }

  if (message.type === MESSAGE_TYPES.CANCEL_TRANSLATION) {
    const id = operationId(message.operationId);
    const controller = activeOperations.get(id);
    if (controller) controller.abort();
    sendResponse({ cancelled: Boolean(controller) });
    return false;
  }

  if (message.type !== MESSAGE_TYPES.TRANSLATE_BATCH) return false;

  const id = operationId(message.operationId);
  const controller = new AbortController();
  if (id) {
    const previous = activeOperations.get(id);
    if (previous) previous.abort();
    activeOperations.set(id, controller);
  }
  translateBatch(message, controller.signal)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ok: false, error: error.message || String(error) });
    })
    .finally(() => {
      if (id && activeOperations.get(id) === controller) activeOperations.delete(id);
    });

  return true;
});
