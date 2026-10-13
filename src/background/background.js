try {
  importScripts(
    "../lib/constants.js",
    "../lib/cache.js",
    "../lib/translation-quality.js",
    "../lib/google-translate.js",
    "../lib/remote-google-translator.js",
    "../lib/ollama-translator.js",
    "../lib/ai-provider.js",
    "../lib/term-notes.js"
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
  isSupportedLanguage,
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
  isSupportedLanguage: () => false,
  normalizeTranslationEngine: (value) => (value === "remote" || value === "ollama" ? value : "device"),
  normalizeOllamaModel: (value) => value || "qwen3.5:4b"
};

const Cache = self.AcademyLensCache;
const TranslationQuality = self.AcademyLensTranslationQuality;
const GoogleTranslate = self.AcademyLensGoogleTranslate;
const RemoteGoogleTranslator = self.AcademyLensRemoteGoogleTranslator;
const OllamaTranslator = self.AcademyLensOllamaTranslator;
const AIProvider = self.AcademyLensAIProvider;
const PROVIDER_SECRETS_KEY = "academylens.providerSecrets";
// Session secrets never enter content-script settings or persistent storage.
const sessionAccessReady = chrome.storage.session?.setAccessLevel
  ? chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
  : Promise.resolve();

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const FETCH_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 350;
const MAX_CONCURRENT_REMOTE_FETCHES = 5;

let cacheWriteChain = Promise.resolve();
const activeOperations = new Map();
chrome.storage.onChanged?.addListener((changes, area) => {
  const credentialsChanged = area === "session" && changes[PROVIDER_SECRETS_KEY];
  const settingsChange = area === "local" && changes[STORAGE_KEYS.SETTINGS];
  const revisionChanged = settingsChange &&
    Number(settingsChange.oldValue?.providerRevision || 0) !== Number(settingsChange.newValue?.providerRevision || 0);
  if (credentialsChanged || revisionChanged) {
    for (const controller of activeOperations.values()) controller.abort();
  }
});
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

async function aiConfiguration(settings, engine) {
  if (!AIProvider) throw new Error("AI provider unavailable");
  if (engine === "ollama") {
    return { engine, model: normalizeOllamaModel(settings.ollamaModel), origin: OLLAMA_ORIGIN };
  }
  await sessionAccessReady;
  const stored = await chrome.storage.session.get(PROVIDER_SECRETS_KEY);
  const secrets = stored[PROVIDER_SECRETS_KEY] || {};
  const beforeRequest = async (signal) => {
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    const origin = engine === "puter" ? "https://api.puter.com/*" : `${new URL(settings.apiEndpoint).origin}/*`;
    if (!(await hasOriginPermission(origin))) throw new Error("Selected provider permission was removed");
    const [currentSettingsState, currentSecretsState] = await Promise.all([
      getLocal([STORAGE_KEYS.SETTINGS]), chrome.storage.session.get(PROVIDER_SECRETS_KEY)
    ]);
    const currentSettings = currentSettingsState[STORAGE_KEYS.SETTINGS] || {};
    const currentSecrets = currentSecretsState[PROVIDER_SECRETS_KEY] || {};
    const sameSecret = engine === "puter" ? currentSecrets.puterToken === secrets.puterToken :
      currentSecrets.apiKey === secrets.apiKey && currentSecrets.apiEndpoint === secrets.apiEndpoint;
    if (normalizeTranslationEngine(currentSettings.translationEngine) !== engine ||
        currentSettings.targetLanguage !== settings.targetLanguage ||
        !matchesProviderSelection({ ...settings, translationEngine: engine }, currentSettings) || !sameSecret) {
      throw new Error("AI connection changed; start a new request");
    }
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
  };
  if (engine === "puter") {
    return { engine, model: String(settings.puterModel || "").trim(), secret: secrets.puterToken,
      origin: "https://api.puter.com/*", beforeRequest };
  }
  const url = AIProvider.endpoint(settings.apiEndpoint);
  if (secrets.apiEndpoint !== url) throw new Error("Reconnect the API key for the selected endpoint");
  return { engine, endpoint: url, model: String(settings.apiModel || "").trim(), secret: secrets.apiKey,
    origin: `${new URL(url).origin}/*`, beforeRequest };
}

function matchesProviderSelection(message, settings) {
  if (["api", "puter"].includes(message.translationEngine) &&
      Number(message.providerRevision || 0) !== Number(settings.providerRevision || 0)) return false;
  if (message.translationEngine === "api") {
    return message.apiEndpoint === settings.apiEndpoint && message.apiModel === settings.apiModel;
  }
  if (message.translationEngine === "puter") return message.puterModel === settings.puterModel;
  if (message.translationEngine === "ollama") {
    return normalizeOllamaModel(message.ollamaModel) === normalizeOllamaModel(settings.ollamaModel);
  }
  return true;
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

async function validateTranslation(original, translated, targetLanguage) {
  if (!TranslationQuality) return { ok: true, issue: "" };
  const detectLanguage =
    chrome.i18n && typeof chrome.i18n.detectLanguage === "function" ? (text) => chrome.i18n.detectLanguage(text) : null;
  if (typeof TranslationQuality.validateAsync === "function") {
    return TranslationQuality.validateAsync(original, translated, targetLanguage, detectLanguage);
  }
  return TranslationQuality.validate(original, translated, targetLanguage);
}

function withCacheWriteLock(task) {
  const nextWrite = cacheWriteChain.then(task, task);
  cacheWriteChain = nextWrite.catch(() => {});
  return nextWrite;
}

async function mergeCacheUpdates(cacheUpdates, expectedEpoch, cacheDeleteKeys = []) {
  const deleteKeys = [...new Set(cacheDeleteKeys || [])];
  if (!Object.keys(cacheUpdates).length && deleteKeys.length === 0) return { persisted: true };

  try {
    await withCacheWriteLock(async () => {
      const stored = await getLocal([STORAGE_KEYS.CACHE, STORAGE_KEYS.CACHE_EPOCH]);
      const currentEpoch = cacheEpochValue(stored[STORAGE_KEYS.CACHE_EPOCH]);
      if (expectedEpoch !== undefined && cacheEpochValue(expectedEpoch) !== currentEpoch) {
        return;
      }
      const cache = stored[STORAGE_KEYS.CACHE] || {};
      for (const key of deleteKeys) delete cache[key];
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
  const targetLanguage = String(message.targetLanguage || "").trim();
  if (!isSupportedLanguage(targetLanguage) || targetLanguage === "en") {
    return { ok: false, translated: {}, errors: {}, error: "Unsupported target language" };
  }
  const engine = message.translationEngine;
  const usesAI = engine === "api" || engine === "puter";
  if (engine !== TRANSLATION_ENGINES.REMOTE && engine !== TRANSLATION_ENGINES.OLLAMA && !usesAI) {
    return { ok: false, translated: {}, errors: {}, error: "Explicit remote translation engine required" };
  }
  const usesOllama = engine === TRANSLATION_ENGINES.OLLAMA;
  const settingsState = await getLocal([STORAGE_KEYS.SETTINGS]);
  const selectedSettings = settingsState[STORAGE_KEYS.SETTINGS] || {};
  const selectedEngine = normalizeTranslationEngine(selectedSettings.translationEngine);
  if (selectedEngine !== engine) {
    return { ok: false, translated: {}, errors: {}, error: "Request does not match the selected translation engine" };
  }
  if (selectedSettings.targetLanguage !== targetLanguage) {
    return { ok: false, translated: {}, errors: {}, error: "Request does not match the selected target language" };
  }
  if (!matchesProviderSelection(message, selectedSettings)) {
    return { ok: false, translated: {}, errors: {}, error: "AI provider configuration changed; try again" };
  }
  const ollamaModel = normalizeOllamaModel(message.ollamaModel);
  if (usesOllama && normalizeOllamaModel(selectedSettings.ollamaModel) !== ollamaModel) {
    return { ok: false, translated: {}, errors: {}, error: "Request does not match the selected Ollama model" };
  }
  const aiConfig = usesAI ? await aiConfiguration(selectedSettings, engine) : null;
  const permissionOrigin = aiConfig ? aiConfig.origin : usesOllama ? OLLAMA_ORIGIN : REMOTE_TRANSLATION_ORIGIN;
  if (!(await hasOriginPermission(permissionOrigin))) {
    return {
      ok: false,
      translated: {},
      errors: {},
      error: usesOllama ? "Ollama localhost permission not granted" : "Remote translation permission not granted"
    };
  }
  const context = (typeof message.context === "string" ? message.context : JSON.stringify(message.context || "")).slice(0, 2000);
  const cacheScope = aiConfig ? {
    ...(message.cacheScope || {}),
    provider: `${engine}-${Cache.stableHash(JSON.stringify([aiConfig.endpoint || "puter", aiConfig.model, AIProvider.PROMPT_VERSION, context]))}`
  } : usesOllama ? ollamaCacheScope(message, ollamaModel) : googleCacheScope(message);
  const cacheMeta = Cache.normalizeScope(cacheScope);
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
  const cacheDeleteKeys = [];
  const stats = {
    cacheHits: 0,
    cacheMisses: 0,
    qualityRejectedCacheHits: 0,
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
      ...cacheMeta,
      createdAt: Date.now(),
      accessedAt: Date.now()
    };
  }

  for (const text of texts) {
    const key = Cache.cacheKey(targetLanguage, text, cacheScope);
    if (Cache.entryMatches(cache[key], text, targetLanguage, cacheScope)) {
      if (!(await validateTranslation(text, cache[key].translated, targetLanguage)).ok) {
        stats.cacheMisses += 1;
        stats.qualityRejectedCacheHits += 1;
        cacheDeleteKeys.push(key);
        cacheMisses.push(text);
        continue;
      }
      translated[text] = cache[key].translated;
      cacheUpdates[key] = {
        original: text,
        targetLanguage,
        ...cacheMeta,
        accessedAt: Date.now()
      };
      stats.cacheHits += 1;
      continue;
    }
    stats.cacheMisses += 1;
    cacheMisses.push(text);
  }

  if (usesAI && cacheMisses.length) {
    try {
      let results;
      try {
        results = await AIProvider.translate(aiConfig, { texts: cacheMisses, targetLanguage, context }, signal);
      } catch (error) {
        if (signal?.aborted || error.name === "AbortError") throw error;
        // Only malformed structured output is retried; do not fan out billing,
        // permission, quota, or transport failures into many requests.
        if (!/invalid translation JSON|mismatched translation batch/.test(error.message)) throw error;
        results = [];
      }
      for (let index = 0; index < cacheMisses.length; index += 1) {
        const text = cacheMisses[index];
        let result = results[index];
        let quality = result ? await validateTranslation(text, result, targetLanguage) : { ok: false, issue: "batch-format" };
        if (!quality.ok) {
          try {
            [result] = await AIProvider.translate(aiConfig, { texts: [text], targetLanguage, context }, signal);
            quality = await validateTranslation(text, result, targetLanguage);
          } catch (error) {
            if (signal?.aborted || error.name === "AbortError") throw error;
            quality = { ok: false, issue: error.message || "request-failed" };
          }
        }
        if (quality.ok) recordTranslation(text, result);
        else {
          stats.failed += 1;
          errors[text] = `AI translation quality check failed: ${quality.issue}`;
        }
      }
    } catch (error) {
      for (const text of cacheMisses) {
        stats.failed += 1;
        errors[text] = error.message || String(error);
      }
    }
  } else if (usesOllama && cacheMisses.length) {
    try {
      const results = await ollamaTranslateBatch(cacheMisses, targetLanguage, ollamaModel, signal);
      if (results.length !== cacheMisses.length) throw new Error("Ollama returned a mismatched translation batch");
      for (let index = 0; index < cacheMisses.length; index += 1) {
        const text = cacheMisses[index];
        let result = results[index];
        let quality = await validateTranslation(text, result, targetLanguage);
        if (!quality.ok) {
          try {
            [result] = await ollamaTranslateBatch([text], targetLanguage, ollamaModel, signal);
            quality = await validateTranslation(text, result, targetLanguage);
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
          const quality = await validateTranslation(text, result, targetLanguage);
          if (quality.ok) {
            recordTranslation(text, result);
          } else {
            stats.failed += 1;
            errors[text] = `Google translation quality check failed: ${quality.issue}`;
          }
        } catch (error) {
          stats.failed += 1;
          errors[text] = error.message || String(error);
        }
      })
    );
  }

  if (signal?.aborted) throw new DOMException("Translation cancelled", "AbortError");
  const cacheResult = await mergeCacheUpdates(cacheUpdates, expectedCacheEpoch, cacheDeleteKeys);
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

async function explainText(message, signal) {
  if (signal?.aborted) throw new DOMException("Explanation cancelled", "AbortError");
  const stored = await getLocal([STORAGE_KEYS.SETTINGS]);
  const settings = stored[STORAGE_KEYS.SETTINGS] || {};
  const engine = normalizeTranslationEngine(settings.translationEngine);
  if (engine !== message.translationEngine || !matchesProviderSelection(message, settings) ||
      settings.targetLanguage !== message.targetLanguage || !isSupportedLanguage(message.targetLanguage)) {
    throw new Error("Explanation request does not match current settings");
  }
  const original = String(message.original || "").trim();
  if (!original || original.length > 12000) throw new Error("Select a course excerpt of at most 12000 characters");
  if (engine === TRANSLATION_ENGINES.REMOTE) {
    const notes = self.AcademyLensTermNotes?.findNotes(original) || [];
    if (!notes.length) return { ok: false, error: "No referenced term note matches this excerpt. Choose an AI engine for an additional explanation." };
    if (!(await hasOriginPermission(REMOTE_TRANSLATION_ORIGIN))) throw new Error("Google Translate permission not granted");
    const source = notes.map((note) => `${note.term}: ${note.definition}`).join("\n\n");
    const text = message.targetLanguage === "en" ? source :
      await remoteTranslate(source, message.targetLanguage, { provider: "google-term-notes-v1" }, signal);
    if (message.targetLanguage !== "en" && !(await validateTranslation(source, text, message.targetLanguage)).ok) {
      throw new Error("Term note translation did not pass the language quality check");
    }
    if (signal?.aborted) throw new DOMException("Explanation cancelled", "AbortError");
    return { ok: true, text, provider: "google-translate", kind: "reference", sources: notes.map((note) => note.source) };
  }
  if (!["api", "puter", "ollama"].includes(engine)) throw new Error("Selected engine cannot generate explanations");
  const config = await aiConfiguration(settings, engine);
  if (!(await hasOriginPermission(config.origin))) throw new Error("Selected provider permission not granted");
  const text = await AIProvider.request(config, "explain", {
    original, targetLanguage: message.targetLanguage,
    context: (typeof message.context === "string" ? message.context : JSON.stringify(message.context || "")).slice(0, 2000)
  }, signal);
  if (signal?.aborted) throw new DOMException("Explanation cancelled", "AbortError");
  if (!text.trim() || text.length > 4000) throw new Error("AI explanation is empty or too long");
  const variantIssue = TranslationQuality?.chineseVariantIssue?.(text, message.targetLanguage);
  if (variantIssue) throw new Error(`AI explanation language check failed: ${variantIssue}`);
  if (chrome.i18n?.detectLanguage && TranslationQuality?.detectionIssue) {
    // Language evidence is independent of translation equivalence: an explanation
    // is deliberately a paraphrase, so source-copy/placeholder checks do not apply.
    let detected;
    try { detected = await chrome.i18n.detectLanguage(text); } catch { detected = null; }
    const issue = detected ? TranslationQuality.detectionIssue(detected, message.targetLanguage) : "";
    if (issue) throw new Error(`AI explanation language check failed: ${issue}`);
  }
  if (signal?.aborted) throw new DOMException("Explanation cancelled", "AbortError");
  return { ok: true, text, provider: engine, model: config.model };
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
  return mergeCacheUpdates(message.cacheUpdates || {}, message.expectedCacheEpoch, message.cacheDeleteKeys || []);
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

  const isExplanation = message.type === MESSAGE_TYPES.EXPLAIN_TEXT;
  if (message.type !== MESSAGE_TYPES.TRANSLATE_BATCH && !isExplanation) return false;

  const id = operationId(message.operationId);
  const controller = new AbortController();
  if (id) {
    const previous = activeOperations.get(id);
    if (previous) previous.abort();
    activeOperations.set(id, controller);
  }
  (isExplanation ? explainText(message, controller.signal) : translateBatch(message, controller.signal))
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ok: false, error: error.message || String(error) });
    })
    .finally(() => {
      if (id && activeOperations.get(id) === controller) activeOperations.delete(id);
    });

  return true;
});
