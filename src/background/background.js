try {
  importScripts("../lib/constants.js", "../lib/cache.js", "../lib/google-translate.js");
} catch (error) {
  console.warn("[AcademyLens] library fallback", error);
}

const { MESSAGE_TYPES, STORAGE_KEYS, DEFAULT_SETTINGS, LIMITS } = self.AcademyLensConstants || {
  MESSAGE_TYPES: { TRANSLATE_BATCH: "ACADEMYLENS_TRANSLATE_BATCH" },
  STORAGE_KEYS: { CACHE: "academylens.translationCache.v1" },
  DEFAULT_SETTINGS: { targetLanguage: "ko" },
  LIMITS: { cacheEntries: 600 }
};

const Cache = self.AcademyLensCache;
const GoogleTranslate = self.AcademyLensGoogleTranslate;
const inFlightTranslations = new Map();

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const FETCH_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 350;
const MAX_CONCURRENT_REMOTE_FETCHES = 5;

let activeRemoteFetches = 0;
let cacheWriteChain = Promise.resolve();
const remoteFetchQueue = [];

function getLocal(keys) {
  return chrome.storage.local.get(keys);
}

function setLocal(values) {
  return chrome.storage.local.set(values);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inFlightKey(targetLanguage, text) {
  return Cache.cacheKey(targetLanguage, text);
}

function drainRemoteFetchQueue() {
  while (activeRemoteFetches < MAX_CONCURRENT_REMOTE_FETCHES && remoteFetchQueue.length > 0) {
    const next = remoteFetchQueue.shift();
    next();
  }
}

function runWithRemoteFetchLimit(task) {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeRemoteFetches += 1;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          activeRemoteFetches -= 1;
          drainRemoteFetchQueue();
        });
    };

    if (activeRemoteFetches < MAX_CONCURRENT_REMOTE_FETCHES) {
      run();
    } else {
      remoteFetchQueue.push(run);
    }
  });
}

async function fetchWithRetry(url) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) return response;

      lastError = new Error(`Google Translate request failed with ${response.status}`);
      lastError.retryable = RETRYABLE_STATUS.has(response.status);
      if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_RETRIES) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;
      if (error.retryable === false || attempt === MAX_RETRIES) throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    const jitter = Math.floor(Math.random() * 120);
    await sleep(BASE_BACKOFF_MS * 2 ** attempt + jitter);
  }

  throw lastError || new Error("Google Translate request failed");
}

function remoteTranslate(text, targetLanguage) {
  const key = inFlightKey(targetLanguage, text);
  const existing = inFlightTranslations.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const response = await runWithRemoteFetchLimit(() =>
      fetchWithRetry(GoogleTranslate.buildGoogleTranslateUrl(text, targetLanguage))
    );
    return GoogleTranslate.parseGoogleTranslatePayload(await response.json());
  })().finally(() => {
    inFlightTranslations.delete(key);
  });

  inFlightTranslations.set(key, promise);
  return promise;
}

function withCacheWriteLock(task) {
  const nextWrite = cacheWriteChain.then(task, task);
  cacheWriteChain = nextWrite.catch(() => {});
  return nextWrite;
}

async function mergeCacheUpdates(cacheUpdates) {
  if (!Object.keys(cacheUpdates).length) return { persisted: true };

  try {
    await withCacheWriteLock(async () => {
      const stored = await getLocal([STORAGE_KEYS.CACHE]);
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
  const allTexts = Array.isArray(message.texts)
    ? [...new Set(message.texts.map((text) => String(text)).filter(Boolean))]
    : [];
  const texts = allTexts.slice(0, LIMITS.maxBatchSize || 40);
  const stored = await getLocal([STORAGE_KEYS.CACHE]);
  const cache = stored[STORAGE_KEYS.CACHE] || {};
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
      const key = Cache.cacheKey(targetLanguage, text);
      if (
        cache[key] &&
        cache[key].translated &&
        cache[key].original === text &&
        cache[key].targetLanguage === targetLanguage
      ) {
        translated[text] = cache[key].translated;
        cacheUpdates[key] = {
          original: text,
          targetLanguage,
          accessedAt: Date.now()
        };
        stats.cacheHits += 1;
        return;
      }

      stats.cacheMisses += 1;
      try {
        const result = await remoteTranslate(text, targetLanguage);
        translated[text] = result;
        cacheUpdates[key] = {
          original: text,
          translated: result,
          targetLanguage,
          createdAt: Date.now(),
          accessedAt: Date.now()
        };
      } catch (error) {
        stats.failed += 1;
        errors[text] = error.message || String(error);
      }
    })
  );

  const cacheResult = await mergeCacheUpdates(cacheUpdates);
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== MESSAGE_TYPES.TRANSLATE_BATCH) return false;

  translateBatch(message)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ok: false, error: error.message || String(error) });
    });

  return true;
});
