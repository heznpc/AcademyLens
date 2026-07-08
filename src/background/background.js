try {
  importScripts(
    "../lib/constants.js",
    "../lib/cache.js",
    "../lib/google-translate.js",
    "../lib/remote-google-translator.js"
  );
} catch (error) {
  console.warn("[AcademyLens] library fallback", error);
}

const { MESSAGE_TYPES, STORAGE_KEYS, DEFAULT_SETTINGS, LIMITS } = self.AcademyLensConstants || {
  MESSAGE_TYPES: {
    TRANSLATE_BATCH: "ACADEMYLENS_TRANSLATE_BATCH",
    PERSIST_CACHE_UPDATES: "ACADEMYLENS_PERSIST_CACHE_UPDATES",
    CLEAR_CACHE: "ACADEMYLENS_CLEAR_CACHE"
  },
  STORAGE_KEYS: {
    CACHE: "academylens.translationCache.v1",
    CACHE_EPOCH: "academylens.translationCacheEpoch.v1"
  },
  DEFAULT_SETTINGS: { targetLanguage: "ko" },
  LIMITS: { cacheEntries: 600 }
};

const Cache = self.AcademyLensCache;
const GoogleTranslate = self.AcademyLensGoogleTranslate;
const RemoteGoogleTranslator = self.AcademyLensRemoteGoogleTranslator;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const FETCH_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 350;
const MAX_CONCURRENT_REMOTE_FETCHES = 5;

let cacheWriteChain = Promise.resolve();
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

function remoteTranslate(text, targetLanguage, scope) {
  if (!remoteTranslator) throw new Error("Remote translator unavailable");
  return remoteTranslator.translateText(text, targetLanguage, scope);
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

async function translateBatch(message) {
  const targetLanguage = message.targetLanguage || DEFAULT_SETTINGS.targetLanguage;
  const cacheScope = googleCacheScope(message);
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

  await Promise.all(
    texts.map(async (text) => {
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
        return;
      }

      stats.cacheMisses += 1;
      try {
        const result = await remoteTranslate(text, targetLanguage, cacheScope);
        translated[text] = result;
        cacheUpdates[key] = {
          original: text,
          translated: result,
          targetLanguage,
          ...Cache.normalizeScope(cacheScope),
          createdAt: Date.now(),
          accessedAt: Date.now()
        };
      } catch (error) {
        stats.failed += 1;
        errors[text] = error.message || String(error);
      }
    })
  );

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

  if (message.type !== MESSAGE_TYPES.TRANSLATE_BATCH) return false;

  translateBatch(message)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ok: false, error: error.message || String(error) });
    });

  return true;
});
