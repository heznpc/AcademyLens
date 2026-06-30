(async function initAcademyLens() {
  "use strict";

  const C = globalThis.AcademyLensConstants;
  const Cache = globalThis.AcademyLensCache;
  const BrowserTranslator = globalThis.AcademyLensBrowserTranslator;
  const GoogleTranslate = globalThis.AcademyLensGoogleTranslate;
  const Glossary = globalThis.AcademyLensGlossary;
  const Text = globalThis.AcademyLensTextUtils;
  const uiLocale = C && C.getUiLocale ? C.getUiLocale(navigator.language) : "en";
  const FRAME_MESSAGE_SOURCE = "AcademyLens";
  const BACKGROUND_RESPONSE_TIMEOUT_MS = 12000;
  const BACKGROUND_RESPONSE_MAX_TIMEOUT_MS = 90000;
  const BACKGROUND_TIMEOUT_CODE = "ACADEMYLENS_BACKGROUND_TIMEOUT";
  const CONTENT_FALLBACK_FETCH_TIMEOUT_MS = 8000;
  const CONTENT_FALLBACK_MAX_RETRIES = 2;
  const CONTENT_FALLBACK_BASE_BACKOFF_MS = 350;
  const CONTENT_FALLBACK_MAX_CONCURRENT_FETCHES = 5;
  const RETRYABLE_TRANSLATE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
  const isTopFrame = window.top === window;

  if (!C || !Glossary || !Text || !C.isAcademyUrl(location.href)) return;

  const state = {
    settings: { ...C.DEFAULT_SETTINGS },
    glossaryIndex: null,
    glossaries: new Map(),
    panel: null,
    shadow: null,
    replacements: [],
    nodeRecords: new WeakMap(),
    lastUrl: location.href,
    generation: 0,
    observer: null,
    debounceTimer: 0,
    placementTimer: 0,
    placementFrame: 0,
    placementSettleTimers: [],
    latestFrameCommand: null,
    frameAggregates: new Map(),
    handledFrameMessages: new Set(),
    browserTranslatorStatus: "unchecked",
    providerMode: "checking",
    providerDetail: "",
    translationQueue: {
      timer: 0,
      active: false,
      pending: null,
      resolvers: []
    },
    selectedCorrection: null,
    corrections: {},
    lastDiagnostics: null,
    routeVersion: 0,
    collapsed: false,
    collapseUserSet: false,
    suppressMutationUntil: 0
  };
  const contentFallbackInFlight = new Map();
  const contentFallbackFetchQueue = [];
  let activeContentFallbackFetches = 0;

  function frameMessageId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function getLocal(keys) {
    return chrome.storage.local.get(keys);
  }

  function setStatus(message, tone) {
    if (!state.shadow) return;
    const status = state.shadow.querySelector("[data-status]");
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone || "neutral";
  }

  function setProgress(percent) {
    if (!state.shadow) return;
    const progress = state.shadow.querySelector("[data-progress]");
    if (!progress) return;
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    progress.style.setProperty("--value", `${value}%`);
    progress.setAttribute("aria-valuenow", String(value));
    progress.dataset.active = String(value > 0 && value < 100);
  }

  function updateLanguageSupport() {
    if (!state.shadow) return;
    const note = state.shadow.querySelector("[data-language-note]");
    if (!note) return;
    note.textContent = C.getLanguageSupportMessage(state.settings.targetLanguage, uiLocale, state.glossaryIndex);
    note.dataset.glossary = String(C.isGlossaryBackedLanguage(state.settings.targetLanguage, state.glossaryIndex));
  }

  function bumpGeneration() {
    state.generation += 1;
    return state.generation;
  }

  function isCurrentGeneration(generation, targetLanguage, pageUrl) {
    return (
      generation === state.generation && targetLanguage === state.settings.targetLanguage && pageUrl === location.href
    );
  }

  function suppressMutationReactions(durationMs = 250) {
    state.suppressMutationUntil = Math.max(state.suppressMutationUntil, Date.now() + durationMs);
  }

  function setBusy(isBusy, generation) {
    if (generation && generation !== state.generation) return;
    if (!state.shadow) return;
    const panel = state.shadow.querySelector(".panel");
    const translate = state.shadow.querySelector("[data-translate]");
    if (!panel) return;
    const busy = Boolean(isBusy);
    panel.setAttribute("aria-busy", String(busy));
    panel.dataset.busy = String(busy);
    if (translate) {
      translate.dataset.busy = String(busy);
      translate.setAttribute("aria-busy", String(busy));
    }
  }

  function setCollapsed(isCollapsed, options = {}) {
    if (options.user) state.collapseUserSet = true;
    state.collapsed = Boolean(isCollapsed);
    if (!state.shadow) return;
    const panel = state.shadow.querySelector(".panel");
    const toggle = state.shadow.querySelector("[data-collapse]");
    const body = state.shadow.querySelector(".body");
    if (!panel || !toggle) return;
    panel.dataset.collapsed = String(state.collapsed);
    if (body) {
      body.toggleAttribute("inert", state.collapsed);
      body.setAttribute("aria-hidden", String(state.collapsed));
    }
    const symbol = toggle.querySelector("[data-toggle-symbol]");
    if (symbol) symbol.textContent = state.collapsed ? "" : "-";
    toggle.setAttribute("aria-expanded", String(!state.collapsed));
    toggle.setAttribute("aria-label", state.collapsed ? message("action.expand") : message("action.collapse"));
  }

  function extensionVersion() {
    try {
      return chrome.runtime.getManifest().version || "dev";
    } catch {
      return "dev";
    }
  }

  function setBrowserTranslatorStatus(status) {
    state.browserTranslatorStatus = status || "unknown";
    if (state.panel) state.panel.dataset.browserTranslator = state.browserTranslatorStatus;
    if (!state.shadow) return;
    const panel = state.shadow.querySelector(".panel");
    if (panel) panel.dataset.browserTranslator = state.browserTranslatorStatus;
  }

  function providerMessageKey(mode) {
    return (
      {
        checking: "provider.checking",
        native: "provider.native",
        nativeReady: "provider.nativeReady",
        nativeDownloadable: "provider.nativeDownloadable",
        nativeDownloading: "provider.nativeDownloading",
        fallback: "provider.fallback",
        background: "provider.background",
        local: "provider.local"
      }[mode] || "provider.fallback"
    );
  }

  function setProviderMode(mode, detail = "") {
    state.providerMode = mode || "fallback";
    state.providerDetail = detail || "";
    if (state.panel) {
      state.panel.dataset.provider = state.providerMode;
      state.panel.dataset.providerDetail = state.providerDetail;
    }
    if (!state.shadow) return;
    const panel = state.shadow.querySelector(".panel");
    const provider = state.shadow.querySelector("[data-provider-chip]");
    if (panel) {
      panel.dataset.provider = state.providerMode;
      panel.dataset.providerDetail = state.providerDetail;
    }
    if (provider) {
      provider.textContent = message(providerMessageKey(state.providerMode));
      provider.dataset.provider = state.providerMode;
      provider.title = state.providerDetail || provider.textContent;
    }
  }

  function updateProviderModeFromBrowserStatus(status) {
    if (status === "available") {
      setProviderMode("nativeReady");
      return;
    }
    if (status === "downloadable" || status === "downloading") {
      setProviderMode(state.settings.enableBrowserTranslatorDownloads ? "nativeDownloading" : "nativeDownloadable");
      return;
    }
    setProviderMode("fallback");
  }

  async function refreshBrowserTranslatorStatus() {
    if (!isTopFrame || !BrowserTranslator || typeof BrowserTranslator.availability !== "function") {
      setBrowserTranslatorStatus("unsupported");
      setProviderMode("fallback");
      return;
    }

    const targetLanguage = state.settings.targetLanguage;
    if (!targetLanguage || targetLanguage === "en") {
      setBrowserTranslatorStatus("unavailable");
      setProviderMode("fallback");
      return;
    }

    setBrowserTranslatorStatus("checking");
    setProviderMode("checking");
    const result = await BrowserTranslator.availability({
      sourceLanguage: "en",
      targetLanguage
    });
    if (targetLanguage !== state.settings.targetLanguage) return;
    setBrowserTranslatorStatus(result.status);
    updateProviderModeFromBrowserStatus(result.status);
  }

  function sendMessage(message, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        settled = true;
        const error = new Error(C.getMessage("status.timeout", uiLocale));
        error.code = BACKGROUND_TIMEOUT_CODE;
        reject(error);
      }, timeoutMs);

      chrome.runtime.sendMessage(message, (response) => {
        if (settled) return;
        window.clearTimeout(timeoutId);
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function drainContentFallbackFetchQueue() {
    while (
      activeContentFallbackFetches < CONTENT_FALLBACK_MAX_CONCURRENT_FETCHES &&
      contentFallbackFetchQueue.length > 0
    ) {
      const next = contentFallbackFetchQueue.shift();
      next();
    }
  }

  function runWithContentFallbackFetchLimit(task) {
    return new Promise((resolve, reject) => {
      const run = () => {
        activeContentFallbackFetches += 1;
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            activeContentFallbackFetches -= 1;
            drainContentFallbackFetchQueue();
          });
      };

      if (activeContentFallbackFetches < CONTENT_FALLBACK_MAX_CONCURRENT_FETCHES) {
        run();
      } else {
        contentFallbackFetchQueue.push(run);
      }
    });
  }

  async function fetchContentTranslationWithRetry(text, targetLanguage) {
    let lastError = null;

    for (let attempt = 0; attempt <= CONTENT_FALLBACK_MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), CONTENT_FALLBACK_FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(GoogleTranslate.buildGoogleTranslateUrl(text, targetLanguage), {
          signal: controller.signal
        });
        if (response.ok) return response;

        lastError = new Error(`Google Translate request failed with ${response.status}`);
        lastError.retryable = RETRYABLE_TRANSLATE_STATUS.has(response.status);
        if (!lastError.retryable || attempt === CONTENT_FALLBACK_MAX_RETRIES) throw lastError;
      } catch (error) {
        lastError = error;
        if (error.retryable === false || attempt === CONTENT_FALLBACK_MAX_RETRIES) throw error;
      } finally {
        window.clearTimeout(timeoutId);
      }

      const jitter = Math.floor(Math.random() * 120);
      await sleep(CONTENT_FALLBACK_BASE_BACKOFF_MS * 2 ** attempt + jitter);
    }

    throw lastError || new Error("Google Translate request failed");
  }

  function translateTextInContent(text, targetLanguage) {
    const key = Cache.cacheKey(targetLanguage, text);
    const existing = contentFallbackInFlight.get(key);
    if (existing) return existing;

    const promise = runWithContentFallbackFetchLimit(async () => {
      const response = await fetchContentTranslationWithRetry(text, targetLanguage);
      return GoogleTranslate.parseGoogleTranslatePayload(await response.json());
    }).finally(() => {
      contentFallbackInFlight.delete(key);
    });

    contentFallbackInFlight.set(key, promise);
    return promise;
  }

  async function persistContentCache(cacheUpdates) {
    if (!Cache || !Object.keys(cacheUpdates).length) return false;
    try {
      const stored = await getLocal([C.STORAGE_KEYS.CACHE]);
      const cache = stored[C.STORAGE_KEYS.CACHE] || {};
      for (const [key, update] of Object.entries(cacheUpdates)) {
        cache[key] = {
          ...(cache[key] || {}),
          ...update
        };
      }
      await chrome.storage.local.set({ [C.STORAGE_KEYS.CACHE]: Cache.trimCache(cache, C.LIMITS.cacheEntries) });
      return true;
    } catch (error) {
      console.warn("[AcademyLens] content cache persistence failed", error);
      return false;
    }
  }

  function glossarySignature(glossary) {
    if (!glossary) return "g0";
    const parts = [
      glossary.locale || "unknown",
      (glossary.protectedTerms || []).length,
      (glossary.terms || []).length,
      Cache && typeof Cache.stableHash === "function"
        ? Cache.stableHash(
            (glossary.terms || []).map((entry) => `${entry.source}->${entry.target}`).join("|") +
              "|" +
              (glossary.protectedTerms || []).join("|")
          )
        : "h0"
    ];
    return `g-${parts.join("-")}`;
  }

  function correctionSignature(corrections) {
    const entries = Object.entries(corrections || {}).sort(([a], [b]) => a.localeCompare(b));
    if (!entries.length) return "c0";
    const payload = entries
      .map(([key, value]) => `${key}:${value.targetLanguage}:${value.original}:${value.translated}`)
      .join("|");
    return `c-${entries.length}-${Cache && typeof Cache.stableHash === "function" ? Cache.stableHash(payload) : "h0"}`;
  }

  function cacheScope(provider, glossary, corrections) {
    return {
      provider,
      glossarySignature: glossarySignature(glossary),
      correctionSignature: correctionSignature(corrections)
    };
  }

  function cacheHasTranslation(cache, key, text, targetLanguage, scope) {
    return Cache && typeof Cache.entryMatches === "function"
      ? Cache.entryMatches(cache[key], text, targetLanguage, scope)
      : Boolean(
          cache[key] &&
          cache[key].translated &&
          cache[key].original === text &&
          cache[key].targetLanguage === targetLanguage
        );
  }

  function cacheUpdateMeta(scope) {
    return Cache && typeof Cache.normalizeScope === "function" ? Cache.normalizeScope(scope) : {};
  }

  function correctionKey(targetLanguage, text) {
    return `${targetLanguage}:${Text.stableHash(Text.normalizeWhitespace(text))}`;
  }

  async function loadCorrections() {
    try {
      const stored = await getLocal([C.STORAGE_KEYS.CORRECTIONS]);
      state.corrections = stored[C.STORAGE_KEYS.CORRECTIONS] || {};
      updateCorrectionsManager();
      return state.corrections;
    } catch {
      state.corrections = {};
      updateCorrectionsManager();
      return {};
    }
  }

  function correctionFor(corrections, targetLanguage, text) {
    const normalized = Text.normalizeWhitespace(text);
    const correction = corrections[correctionKey(targetLanguage, normalized)];
    if (!correction || correction.original !== normalized || correction.targetLanguage !== targetLanguage) return "";
    return correction.translated || "";
  }

  async function persistCorrection(record, translated) {
    if (!record || !translated) return false;
    const original = Text.normalizeWhitespace(record.normalized || record.originalText || record.original || "");
    if (!original) return false;

    try {
      const corrections = await loadCorrections();
      corrections[correctionKey(state.settings.targetLanguage, original)] = {
        original,
        translated,
        targetLanguage: state.settings.targetLanguage,
        createdAt: Date.now(),
        accessedAt: Date.now()
      };
      await chrome.storage.local.set({ [C.STORAGE_KEYS.CORRECTIONS]: corrections });
      state.corrections = corrections;
      updateCorrectionsManager();
      return true;
    } catch (error) {
      console.warn("[AcademyLens] local correction persistence failed", error);
      return false;
    }
  }

  async function deleteCorrection(key) {
    if (!key) return false;
    const corrections = await loadCorrections();
    if (!corrections[key]) return false;
    delete corrections[key];
    await chrome.storage.local.set({ [C.STORAGE_KEYS.CORRECTIONS]: corrections });
    state.corrections = corrections;
    updateCorrectionsManager();
    return true;
  }

  async function clearCorrections() {
    state.corrections = {};
    await chrome.storage.local.set({ [C.STORAGE_KEYS.CORRECTIONS]: {} });
    updateCorrectionsManager();
  }

  async function clearTranslationCache() {
    await chrome.storage.local.set({ [C.STORAGE_KEYS.CACHE]: {} });
    state.lastDiagnostics = null;
    updateDiagnosticsPanel();
  }

  function correctionEntriesForPanel() {
    return Object.entries(state.corrections || {}).sort((a, b) => {
      const left = a[1] || {};
      const right = b[1] || {};
      return (
        String(left.targetLanguage || "").localeCompare(String(right.targetLanguage || "")) ||
        String(left.original || "").localeCompare(String(right.original || ""))
      );
    });
  }

  function updateCorrectionPreview() {
    if (!state.shadow) return;
    const select = state.shadow.querySelector("[data-correction-list]");
    const preview = state.shadow.querySelector("[data-correction-preview]");
    if (!select || !preview) return;
    const correction = state.corrections && state.corrections[select.value];
    if (!correction) {
      preview.textContent = message("panel.noCorrections");
      return;
    }
    preview.textContent = `${correction.targetLanguage}: ${correction.original} -> ${correction.translated}`;
  }

  function updateCorrectionsManager() {
    if (!state.shadow) return;
    const select = state.shadow.querySelector("[data-correction-list]");
    const count = state.shadow.querySelector("[data-correction-count]");
    const deleteButton = state.shadow.querySelector("[data-delete-correction]");
    const clearButton = state.shadow.querySelector("[data-clear-corrections]");
    if (!select || !count || !deleteButton || !clearButton) return;

    const previousValue = select.value;
    const entries = correctionEntriesForPanel();
    count.textContent = `(${entries.length})`;
    select.replaceChildren();
    for (const [key, correction] of entries) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = `${correction.targetLanguage}: ${correction.original}`;
      select.append(option);
    }
    if (entries.some(([key]) => key === previousValue)) {
      select.value = previousValue;
    }
    select.disabled = entries.length === 0;
    deleteButton.disabled = entries.length === 0;
    clearButton.disabled = entries.length === 0;
    updateCorrectionPreview();
  }

  async function deleteSelectedCorrection() {
    if (!state.shadow) return;
    const select = state.shadow.querySelector("[data-correction-list]");
    if (!select || !select.value) return;
    const deleted = await deleteCorrection(select.value);
    if (deleted) {
      clearSelectedCorrection();
      setStatus(message("status.correctionDeleted"), "ok");
    }
  }

  async function clearAllCorrections() {
    await clearCorrections();
    clearSelectedCorrection();
    setStatus(message("status.correctionsCleared"), "ok");
  }

  async function clearCacheFromPanel() {
    await clearTranslationCache();
    setStatus(message("status.cacheCleared"), "ok");
  }

  function updateDiagnosticsPanel() {
    if (!state.shadow) return;
    const output = state.shadow.querySelector("[data-diagnostics-output]");
    if (!output) return;
    const diagnostics = state.lastDiagnostics;
    if (!diagnostics) {
      output.textContent = message("panel.diagnosticsIdle");
      return;
    }
    output.textContent = message("panel.diagnosticsSummary", {
      provider: diagnostics.provider || state.providerMode || "fallback",
      hits: diagnostics.cacheHits || 0,
      misses: diagnostics.cacheMisses || 0,
      fallback: diagnostics.fallbackTexts || 0,
      corrections: diagnostics.corrections || 0,
      groups: diagnostics.contextGroups || 0,
      frames: diagnostics.frames || 0
    });
  }

  async function translateBatchInContent(texts, targetLanguage, scope = {}) {
    if (!Cache || !GoogleTranslate || typeof fetch !== "function") {
      throw new Error(message("status.failed"));
    }

    const stored = await getLocal([C.STORAGE_KEYS.CACHE]);
    const cache = stored[C.STORAGE_KEYS.CACHE] || {};
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
          const result = await translateTextInContent(text, targetLanguage);
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

    const persisted = await persistContentCache(cacheUpdates);
    if (!persisted && Object.keys(cacheUpdates).length) {
      stats.cachePersistFailed = true;
    }

    return {
      ok: Object.keys(translated).length > 0 || texts.length === 0,
      translated,
      errors,
      stats
    };
  }

  async function translateBatchWithBrowserTranslator(texts, targetLanguage, scope = {}) {
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

    if (requestedTexts.length === 0) {
      return {
        ok: true,
        translated: {},
        errors: {},
        stats
      };
    }

    try {
      const support = await BrowserTranslator.availability({
        sourceLanguage: "en",
        targetLanguage
      });
      setBrowserTranslatorStatus(support.status);
      const canUseBrowserTranslator =
        support.status === "available" ||
        (state.settings.enableBrowserTranslatorDownloads &&
          (support.status === "downloadable" || support.status === "downloading"));
      if (!canUseBrowserTranslator) {
        updateProviderModeFromBrowserStatus(support.status);
        return null;
      }
      setProviderMode(support.status === "available" ? "native" : "nativeDownloading");

      const stored = await getLocal([C.STORAGE_KEYS.CACHE]);
      const cache = stored[C.STORAGE_KEYS.CACHE] || {};
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
          continue;
        }

        stats.cacheMisses += 1;
        browserTexts.push(text);
      }

      if (browserTexts.length > 0) {
        const browserTranslations = await BrowserTranslator.translateBatch(browserTexts, {
          sourceLanguage: "en",
          targetLanguage,
          allowDownload: Boolean(state.settings.enableBrowserTranslatorDownloads),
          onDownloadProgress() {
            setBrowserTranslatorStatus("downloading");
            setProviderMode("nativeDownloading");
          }
        });

        for (const text of browserTexts) {
          const result = browserTranslations ? browserTranslations[text] : "";
          if (translationLooksSuspicious(text, result, targetLanguage)) {
            stats.failed += 1;
            errors[text] = message("status.failed");
            continue;
          }

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

      const persisted = await persistContentCache(cacheUpdates);
      if (!persisted && Object.keys(cacheUpdates).length) {
        stats.cachePersistFailed = true;
      }

      return {
        ok: stats.failed === 0 || Object.keys(translated).length > 0,
        translated,
        errors,
        stats
      };
    } catch (error) {
      console.warn("[AcademyLens] browser translator unavailable; trying background translation", error);
      return null;
    }
  }

  function untranslatedTexts(texts, response) {
    const translated = (response && response.translated) || {};
    return (texts || []).filter((text) => !translated[text]);
  }

  function translationLooksSuspicious(original, translated, targetLanguage) {
    const source = Text.normalizeWhitespace(original || "");
    const result = Text.normalizeWhitespace(translated || "");
    if (!result) return true;
    if (targetLanguage !== "en" && result === source && Text.hasLatinLetters(source)) return true;
    if (/__AL_(?:TERM|INLINE)_\d+__/.test(result)) return true;
    return false;
  }

  function mergeTranslationResponses(primary, secondary, requestedTexts) {
    const translated = {
      ...((primary && primary.translated) || {}),
      ...((secondary && secondary.translated) || {})
    };
    const errors = {
      ...((primary && primary.errors) || {})
    };
    for (const text of Object.keys((secondary && secondary.translated) || {})) {
      delete errors[text];
    }
    Object.assign(errors, (secondary && secondary.errors) || {});

    return {
      ok: Object.keys(translated).length > 0 || (requestedTexts || []).length === 0,
      translated,
      errors,
      stats: {
        ...((primary && primary.stats) || {}),
        fallback: (secondary && secondary.stats) || null,
        requested: (requestedTexts || []).length,
        failed: Object.keys(errors).length
      }
    };
  }

  async function sendBackgroundTranslationBatch(payload, timeoutMs) {
    setProviderMode("background");
    const fallbackScope = {
      ...((payload && payload.cacheScope) || {}),
      provider: "google-translate"
    };
    const requestedTimeout = Number(timeoutMs) || BACKGROUND_RESPONSE_TIMEOUT_MS;
    const backgroundTimeout = Math.max(
      BACKGROUND_RESPONSE_TIMEOUT_MS,
      Math.min(requestedTimeout, BACKGROUND_RESPONSE_MAX_TIMEOUT_MS)
    );
    try {
      const response = await sendMessage(payload, backgroundTimeout);
      if (response && response.ok) return response;
      if (response && response.translated && Object.keys(response.translated).length > 0) return response;
    } catch (error) {
      if (error && error.code === BACKGROUND_TIMEOUT_CODE) {
        throw error;
      }
      console.warn("[AcademyLens] background translation unavailable; trying content fallback", error);
    }

    setProviderMode("fallback");
    return translateBatchInContent(payload.texts || [], payload.targetLanguage, fallbackScope);
  }

  async function sendTranslationBatch(payload, timeoutMs) {
    const requestedTexts = payload.texts || [];
    const nativeScope = {
      ...((payload && payload.cacheScope) || {}),
      provider:
        BrowserTranslator && BrowserTranslator.PROVIDER_ID ? BrowserTranslator.PROVIDER_ID : "browser-translator"
    };
    const browserResponse = await translateBatchWithBrowserTranslator(
      requestedTexts,
      payload.targetLanguage,
      nativeScope
    );
    if (browserResponse) {
      const missingTexts = untranslatedTexts(requestedTexts, browserResponse);
      if (missingTexts.length === 0) return mergeTranslationResponses(browserResponse, null, requestedTexts);
      const fallbackResponse = await sendBackgroundTranslationBatch(
        {
          ...payload,
          texts: missingTexts
        },
        timeoutMs
      );
      return mergeTranslationResponses(browserResponse, fallbackResponse, requestedTexts);
    }
    return sendBackgroundTranslationBatch(payload, timeoutMs);
  }

  function message(key, params) {
    return C.getMessage(key, uiLocale, params);
  }

  function languageLabel(code) {
    return C.getLanguageLabel(code, uiLocale);
  }

  function framePayload(action, extra = {}) {
    return {
      source: FRAME_MESSAGE_SOURCE,
      action,
      messageId: extra.messageId || frameMessageId(),
      targetLanguage: extra.targetLanguage || state.settings.targetLanguage,
      generation: extra.generation ?? state.generation,
      pageUrl: extra.pageUrl || location.href,
      routeVersion: extra.routeVersion ?? state.routeVersion
    };
  }

  function rememberFrameCommand(payload) {
    if (!payload || !["translate", "restore"].includes(payload.action)) return;
    state.latestFrameCommand = payload;
  }

  function isPendingFrameCommandCurrent(payload) {
    if (!payload) return false;
    if (!isTopFrame) return true;
    return payload.pageUrl === location.href && payload.routeVersion === state.routeVersion;
  }

  function postPayloadToFrame(frame, payload) {
    if (!frame || !frame.contentWindow || !payload) return false;
    try {
      frame.contentWindow.postMessage(payload, location.origin);
      return true;
    } catch {
      return false;
    }
  }

  function postToChildFrames(action, extra = {}) {
    let sent = 0;
    const payload = framePayload(action, extra);
    if (extra.remember !== false) rememberFrameCommand(payload);

    for (const frame of document.querySelectorAll("iframe")) {
      if (postPayloadToFrame(frame, payload)) {
        sent += 1;
      }
    }

    return { payload, sent };
  }

  function dispatchPendingFrameCommand(targetWindow) {
    if (!state.latestFrameCommand) return 0;
    if (!isPendingFrameCommandCurrent(state.latestFrameCommand)) return 0;
    if (targetWindow) {
      try {
        targetWindow.postMessage(state.latestFrameCommand, location.origin);
        return 1;
      } catch {
        return 0;
      }
    }

    let sent = 0;
    for (const frame of document.querySelectorAll("iframe")) {
      if (postPayloadToFrame(frame, state.latestFrameCommand)) sent += 1;
    }
    return sent;
  }

  function clearFrameAggregates() {
    for (const aggregate of state.frameAggregates.values()) {
      if (aggregate.cleanupTimer) window.clearTimeout(aggregate.cleanupTimer);
    }
    state.frameAggregates.clear();
  }

  function postFrameResult(kind, result = {}) {
    if (isTopFrame || !window.top) return;
    window.top.postMessage(
      {
        source: FRAME_MESSAGE_SOURCE,
        action: "frameResult",
        messageId: state.latestFrameCommand ? state.latestFrameCommand.messageId : "",
        kind,
        applied: result.applied || 0,
        failed: result.failed || 0
      },
      location.origin
    );
  }

  function startFrameAggregate(payload, expected, kind) {
    if (!isTopFrame || !payload || !payload.messageId || expected <= 0) return;
    state.frameAggregates.set(payload.messageId, {
      kind,
      expected,
      received: 0,
      pageApplied: 0,
      pageFailed: 0,
      frameApplied: 0,
      frameFailed: 0,
      cleanupTimer: window.setTimeout(() => state.frameAggregates.delete(payload.messageId), 5000)
    });
  }

  function updateFrameAggregatePage(messageId, result = {}) {
    const aggregate = messageId ? state.frameAggregates.get(messageId) : null;
    if (!aggregate) return;
    aggregate.pageApplied = result.applied || 0;
    aggregate.pageFailed = result.failed || 0;
  }

  function setAggregateStatus(aggregate) {
    if (!aggregate || aggregate.kind !== "translate") return;
    const applied = aggregate.pageApplied || 0;
    const frameCount = aggregate.frameApplied || 0;
    const failed = (aggregate.pageFailed || 0) + (aggregate.frameFailed || 0);
    if (applied > 0 || frameCount > 0) {
      setStatus(message("status.translatedWithFrames", { count: applied, frameCount }), failed > 0 ? "error" : "ok");
    }
  }

  function handleFrameResult(data) {
    if (!isTopFrame || !data || data.action !== "frameResult") return;
    const aggregate = data.messageId ? state.frameAggregates.get(data.messageId) : null;
    if (aggregate) {
      aggregate.received += 1;
      if (data.kind === "translate") {
        aggregate.frameApplied += data.applied || 0;
        aggregate.frameFailed += data.failed || 0;
        setAggregateStatus(aggregate);
      }
      return;
    }
    if (data.kind === "translate" && data.applied > 0) {
      setStatus(message("status.frameTranslated", { count: data.applied }), data.failed > 0 ? "error" : "ok");
    }
    if (data.kind === "restore") {
      setStatus(message("status.frameRestored"), "ok");
    }
  }

  function rememberHandledFrameMessage(messageId) {
    if (!messageId) return false;
    if (state.handledFrameMessages.has(messageId)) return true;
    state.handledFrameMessages.add(messageId);
    if (state.handledFrameMessages.size > 80) {
      state.handledFrameMessages = new Set([...state.handledFrameMessages].slice(-40));
    }
    return false;
  }

  async function handleFrameCommand(data) {
    if (isTopFrame || !data || data.source !== FRAME_MESSAGE_SOURCE) return;
    if (rememberHandledFrameMessage(data.messageId)) return;
    if (data.targetLanguage) {
      state.settings.targetLanguage = data.targetLanguage;
    }
    rememberFrameCommand(framePayload(data.action, data));

    if (data.action === "translate") {
      postToChildFrames("translate", {
        messageId: data.messageId,
        targetLanguage: state.settings.targetLanguage,
        generation: data.generation,
        remember: true
      });
      const result = await translatePage({ broadcastFrames: false });
      postFrameResult("translate", result);
    }

    if (data.action === "restore") {
      postToChildFrames("restore", {
        messageId: data.messageId,
        targetLanguage: state.settings.targetLanguage,
        generation: data.generation,
        remember: true
      });
      const result = restorePage({ broadcastFrames: false });
      postFrameResult("restore", result);
    }
  }

  function watchFrameMessages() {
    window.addEventListener("message", (event) => {
      if (event.origin !== location.origin) return;
      const data = event.data || {};
      if (data.source !== FRAME_MESSAGE_SOURCE) return;
      if (data.action === "frameReady") {
        dispatchPendingFrameCommand(event.source);
        return;
      }
      handleFrameResult(data);
      handleFrameCommand(data);
    });
  }

  function postFrameReady() {
    if (isTopFrame || !window.parent) return;
    window.parent.postMessage(
      {
        source: FRAME_MESSAGE_SOURCE,
        action: "frameReady"
      },
      location.origin
    );
  }

  const BOTTOM_OVERLAY_SELECTOR = [
    "[role='dialog']",
    "[aria-modal='true']",
    "[class*='cookie' i]",
    "[id*='cookie' i]",
    "[class*='privacy' i]",
    "[id*='privacy' i]",
    "[class*='consent' i]",
    "[id*='consent' i]"
  ].join(",");

  function looksLikeBottomOverlay(element, rect) {
    if (!element || element === state.panel || state.panel?.contains(element)) return false;
    if (!Text.isElementVisible(element)) return false;
    if (!rect || rect.width < Math.min(280, window.innerWidth * 0.35) || rect.height < 36) return false;
    if (rect.bottom < window.innerHeight - 12) return false;

    const text = Text.normalizeWhitespace(element.innerText || element.textContent || "");
    const hasCookiePromptText = /cookies?|accept all|reject all|manage preferences/i.test(text);
    const hasOverlayText = hasCookiePromptText || /privacy/i.test(text);
    const style = window.getComputedStyle(element);
    if (["fixed", "sticky"].includes(style.position)) {
      return element.getAttribute("role") === "dialog" || hasOverlayText;
    }

    return (
      window.innerWidth <= 420 &&
      hasCookiePromptText &&
      rect.width > window.innerWidth * 0.7 &&
      rect.height > 80 &&
      rect.height < window.innerHeight * 0.6 &&
      rect.bottom > window.innerHeight - 40
    );
  }

  function collectPanelOverlayCandidates() {
    const candidates = new Set(Array.from(document.body.children));
    for (const element of document.body.querySelectorAll(BOTTOM_OVERLAY_SELECTOR)) {
      candidates.add(element);
    }
    return candidates;
  }

  function updatePanelPlacement() {
    if (!state.panel || !state.shadow) return;
    const panel = state.shadow.querySelector(".panel");
    if (!panel) return;

    const baseGap = 14;
    let offset = 0;

    for (const element of collectPanelOverlayCandidates()) {
      const rect = element.getBoundingClientRect();
      if (!looksLikeBottomOverlay(element, rect)) continue;
      offset = Math.max(offset, Math.ceil(window.innerHeight - rect.top + baseGap));
    }

    panel.dataset.bottomOverlay = String(offset > 0);
    state.panel.style.setProperty("--academylens-bottom-offset", `${offset}px`);
    if (!state.collapseUserSet) {
      setCollapsed(true);
    }
  }

  function requestPanelPlacementFrame() {
    if (state.placementFrame) return;
    state.placementFrame = window.requestAnimationFrame(() => {
      state.placementFrame = 0;
      updatePanelPlacement();
    });
  }

  function schedulePanelPlacement(delay = 80) {
    window.clearTimeout(state.placementTimer);
    if (delay <= 0) {
      requestPanelPlacementFrame();
      return;
    }
    state.placementTimer = window.setTimeout(requestPanelPlacementFrame, delay);
  }

  function settlePanelPlacement() {
    for (const timer of state.placementSettleTimers) {
      window.clearTimeout(timer);
    }
    state.placementSettleTimers = [100, 350, 800, 1500, 3000, 5000].map((delay) =>
      window.setTimeout(requestPanelPlacementFrame, delay)
    );
  }

  async function loadSettings() {
    const stored = await getLocal([C.STORAGE_KEYS.SETTINGS]);
    state.settings = {
      ...C.DEFAULT_SETTINGS,
      ...(stored[C.STORAGE_KEYS.SETTINGS] || {})
    };
  }

  async function loadGlossaryIndex() {
    const response = await fetch(chrome.runtime.getURL("src/data/glossary.index.json"));
    if (!response.ok) throw new Error("Failed to load glossary registry");
    state.glossaryIndex = await response.json();
  }

  function glossaryRecordForLanguage(targetLanguage) {
    return state.glossaryIndex && state.glossaryIndex.glossaries
      ? state.glossaryIndex.glossaries.find((entry) => entry && entry.locale === targetLanguage)
      : null;
  }

  async function ensureGlossary(targetLanguage) {
    if (state.glossaries.has(targetLanguage)) {
      return state.glossaries.get(targetLanguage);
    }

    const record = glossaryRecordForLanguage(targetLanguage);
    let glossary;
    if (record && record.path) {
      const response = await fetch(chrome.runtime.getURL(record.path));
      if (!response.ok) throw new Error(`Failed to load glossary for ${targetLanguage}`);
      glossary = Glossary.normalizeGlossary(await response.json());
    } else {
      glossary = Glossary.normalizeGlossary({
        locale: targetLanguage,
        protectedTerms: state.glossaryIndex ? state.glossaryIndex.protectedTerms : [],
        terms: []
      });
    }

    state.glossaries.set(targetLanguage, glossary);
    return glossary;
  }

  function createPanel() {
    const host = document.createElement("div");
    host.className = "academylens-root";
    host.dataset.version = extensionVersion();
    host.dataset.browserTranslator = state.browserTranslatorStatus;
    host.setAttribute("aria-label", message("panel.aria"));
    const shadow = host.attachShadow({ mode: "open" });
    const iconUrl = chrome.runtime.getURL("assets/icons/icon48.png");
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          color-scheme: light;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          pointer-events: none;
        }
        .panel {
          position: fixed;
          right: 22px;
          bottom: calc(20px + var(--academylens-bottom-offset, 0px));
          z-index: 2147483647;
          width: min(408px, calc(100vw - 44px));
          border: 1px solid rgba(15, 23, 42, 0.14);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
          color: #111827;
          font-size: 14.5px;
          line-height: 1.45;
          overflow: hidden;
          pointer-events: auto;
          opacity: 0;
          transform: translate3d(0, 10px, 0) scale(0.985);
          transform-origin: right bottom;
          transition:
            bottom 180ms ease,
            box-shadow 180ms ease,
            width 190ms cubic-bezier(0.2, 0.8, 0.2, 1),
            opacity 180ms ease-out,
            transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
          will-change: opacity, transform;
        }
        .panel[data-mounted="true"] {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }
        .top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-height: 56px;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(15, 23, 42, 0.1);
        }
        .brand {
          display: inline-flex;
          align-items: center;
          min-width: 0;
          gap: 9px;
        }
        .brand-icon {
          width: 22px;
          height: 22px;
          border-radius: 7px;
          flex: 0 0 auto;
        }
        .name {
          font-size: 15.5px;
          font-weight: 750;
          letter-spacing: 0;
          white-space: nowrap;
        }
        .badge {
          font-size: 12.5px;
          color: #475569;
          white-space: nowrap;
        }
        .top-actions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .icon-button {
          display: inline-grid;
          width: 34px;
          min-height: 34px;
          place-items: center;
          border: 1px solid rgba(15, 23, 42, 0.12);
          border-radius: 8px;
          background: rgba(248, 250, 252, 0.9);
          color: #334155;
          font-size: 16px;
          line-height: 1;
        }
        .toggle-icon {
          display: none;
          width: 24px;
          height: 24px;
          border-radius: 8px;
        }
        [data-toggle-symbol] {
          line-height: 1;
        }
        .body {
          display: grid;
          gap: 12px;
          max-height: min(348px, calc(100vh - 156px));
          overflow-y: auto;
          padding: 14px 16px;
          opacity: 1;
          transform: translateY(0);
          transition:
            max-height 190ms cubic-bezier(0.2, 0.8, 0.2, 1),
            opacity 140ms ease,
            padding 190ms cubic-bezier(0.2, 0.8, 0.2, 1),
            transform 190ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .panel[data-collapsed="true"] {
          width: 56px;
          border-radius: 999px;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
        }
        .panel[data-collapsed="true"] .top {
          justify-content: center;
          min-height: 54px;
          padding: 5px;
          border-bottom: 0;
        }
        .panel[data-collapsed="true"] .brand,
        .panel[data-collapsed="true"] .badge {
          display: none;
        }
        .panel[data-collapsed="true"] .top-actions {
          gap: 0;
        }
        .panel[data-collapsed="true"] .icon-button {
          width: 44px;
          min-height: 44px;
          border-color: #111827;
          border-radius: 999px;
          background: #111827;
          color: #fff;
          font-size: 13px;
          font-weight: 760;
        }
        .panel[data-collapsed="true"] .toggle-icon {
          display: block;
        }
        .panel[data-collapsed="true"] .body {
          max-height: 0;
          padding-top: 0;
          padding-bottom: 0;
          opacity: 0;
          pointer-events: none;
          transform: translateY(-4px);
        }
        .field {
          display: grid;
          gap: 8px;
        }
        .note {
          color: #64748b;
          font-size: 13px;
          line-height: 1.45;
        }
        .note[data-glossary="true"] {
          color: #047857;
        }
        .row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .settings {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .toggles {
          display: inline-flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          min-width: 0;
        }
        .toggle {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #475569;
          font-size: 13.5px;
          line-height: 1;
        }
        .toggle input {
          width: 16px;
          height: 16px;
          margin: 0;
        }
        .provider {
          justify-self: start;
          max-width: 100%;
          min-height: 24px;
          border: 1px solid rgba(15, 23, 42, 0.12);
          border-radius: 999px;
          padding: 3px 9px;
          background: rgba(248, 250, 252, 0.9);
          color: #475569;
          font-size: 12px;
          line-height: 1.35;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .provider[data-provider="native"],
        .provider[data-provider="nativeReady"] {
          border-color: rgba(4, 120, 87, 0.2);
          color: #047857;
        }
        .provider[data-provider="nativeDownloadable"],
        .provider[data-provider="nativeDownloading"] {
          border-color: rgba(180, 83, 9, 0.22);
          color: #92400e;
        }
        .correction {
          display: none;
          gap: 8px;
          border-top: 1px solid rgba(15, 23, 42, 0.08);
          padding-top: 10px;
        }
        .correction[data-active="true"] {
          display: grid;
        }
        .correction label {
          display: grid;
          gap: 6px;
          color: #475569;
          font-size: 12px;
        }
        .correction textarea {
          min-height: 56px;
          resize: vertical;
          border: 1px solid rgba(15, 23, 42, 0.16);
          border-radius: 8px;
          padding: 8px 10px;
          color: #111827;
          font: inherit;
          font-size: 13px;
          line-height: 1.4;
        }
        .correction-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .manager {
          display: grid;
          gap: 8px;
          border-top: 1px solid rgba(15, 23, 42, 0.08);
          padding-top: 10px;
        }
        .manager summary {
          cursor: pointer;
          color: #475569;
          font-size: 12.5px;
          font-weight: 700;
        }
        .manager-body {
          display: grid;
          gap: 8px;
          padding-top: 8px;
        }
        .manager-preview,
        .diagnostics-output {
          min-height: 20px;
          color: #64748b;
          font-size: 12px;
          line-height: 1.45;
          overflow-wrap: anywhere;
        }
        .manager-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .manager-actions.single {
          grid-template-columns: 1fr;
        }
        button, select {
          min-height: 42px;
          border-radius: 8px;
          border: 1px solid rgba(15, 23, 42, 0.16);
          background: #fff;
          color: #111827;
          font: inherit;
          font-size: 14.5px;
          padding: 0 14px;
        }
        button {
          cursor: pointer;
          font-weight: 650;
        }
        button.primary {
          background: #111827;
          color: #fff;
          border-color: #111827;
        }
        .panel[data-busy="true"] button.primary {
          background: #1f2937;
        }
        button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
        .status {
          min-height: 20px;
          color: #475569;
          font-size: 13px;
          line-height: 1.5;
        }
        .status[data-tone="error"] {
          color: #b42318;
        }
        .status[data-tone="ok"] {
          color: #047857;
        }
        .progress {
          --value: 0%;
          flex: 1;
          height: 6px;
          min-width: 96px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.08);
        }
        .progress::before {
          display: block;
          width: var(--value);
          height: 100%;
          border-radius: inherit;
          background: #18b6a7;
          content: "";
          transition: width 160ms ease;
        }
        .progress[data-active="true"]::before {
          background: #3578e5;
        }
        @media (max-width: 420px) {
          .panel {
            right: 12px;
            bottom: calc(14px + var(--academylens-bottom-offset, 0px));
            width: calc(100vw - 24px);
          }
          .panel[data-collapsed="true"] {
            width: 56px;
          }
          .panel[data-bottom-overlay="true"][data-collapsed="true"] {
            top: 84px;
            bottom: auto;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .panel,
          .body,
          .progress::before {
            transition: none;
          }
          .panel {
            opacity: 1;
            transform: none;
          }
        }
      </style>
      <section class="panel" data-collapsed="true" data-version="${extensionVersion()}" data-browser-translator="${state.browserTranslatorStatus}">
        <div class="top">
          <div class="brand">
            <img class="brand-icon" src="${iconUrl}" alt="" />
            <div class="name">AcademyLens</div>
          </div>
          <div class="top-actions">
            <div class="badge">${message("badge.unofficial")}</div>
            <button type="button" class="icon-button" data-collapse aria-expanded="true" aria-label="${message("action.collapse")}">
              <img class="toggle-icon" src="${iconUrl}" alt="" />
              <span data-toggle-symbol aria-hidden="true">-</span>
            </button>
          </div>
        </div>
        <div class="body">
          <div class="field">
            <select data-language aria-label="${message("field.targetLanguage")}"></select>
            <div class="note" data-language-note></div>
          </div>
          <div class="settings">
            <div class="toggles">
              <label class="toggle">
                <input type="checkbox" data-auto-translate />
                <span>${message("panel.autoTranslate")}</span>
              </label>
              <label class="toggle">
                <input type="checkbox" data-native-download />
                <span>${message("panel.nativeDownloads")}</span>
              </label>
            </div>
            <div class="progress" data-progress role="progressbar" aria-label="${message("progress.translation")}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
          </div>
          <div class="provider" data-provider-chip data-provider="${state.providerMode}">${message(providerMessageKey(state.providerMode))}</div>
          <div class="correction" data-correction data-active="false">
            <label>
              <span>${message("panel.correction")}</span>
              <textarea data-correction-input></textarea>
            </label>
            <div class="correction-actions">
              <button type="button" data-save-correction>${message("action.saveCorrection")}</button>
              <button type="button" data-cancel-correction>${message("action.cancelCorrection")}</button>
            </div>
          </div>
          <details class="manager" data-corrections-manager>
            <summary>${message("panel.corrections")} <span data-correction-count>0</span></summary>
            <div class="manager-body">
              <select data-correction-list aria-label="${message("panel.corrections")}"></select>
              <div class="manager-preview" data-correction-preview>${message("panel.noCorrections")}</div>
              <div class="manager-actions">
                <button type="button" data-delete-correction>${message("action.deleteCorrection")}</button>
                <button type="button" data-clear-corrections>${message("action.clearCorrections")}</button>
              </div>
            </div>
          </details>
          <details class="manager" data-diagnostics>
            <summary>${message("panel.diagnostics")}</summary>
            <div class="manager-body">
              <div class="diagnostics-output" data-diagnostics-output>${message("panel.diagnosticsIdle")}</div>
              <div class="manager-actions single">
                <button type="button" data-clear-cache>${message("action.clearCache")}</button>
              </div>
            </div>
          </details>
          <div class="row">
            <button type="button" class="primary" data-translate>${message("action.translate")}</button>
            <button type="button" data-restore>${message("action.restore")}</button>
          </div>
          <div class="status" data-status>${message("status.ready")}</div>
        </div>
      </section>
    `;

    const language = shadow.querySelector("[data-language]");
    for (const item of C.SUPPORTED_LANGUAGES) {
      const option = document.createElement("option");
      option.value = item.code;
      option.lang = item.lang || item.code;
      option.textContent = languageLabel(item.code);
      language.append(option);
    }
    language.value = state.settings.targetLanguage;
    const autoTranslate = shadow.querySelector("[data-auto-translate]");
    autoTranslate.checked = Boolean(state.settings.autoTranslate);
    const nativeDownload = shadow.querySelector("[data-native-download]");
    nativeDownload.checked = Boolean(state.settings.enableBrowserTranslatorDownloads);
    language.addEventListener("change", async () => {
      await applySettings({ targetLanguage: language.value }, { skipAutoTranslate: true });
      await chrome.storage.local.set({ [C.STORAGE_KEYS.SETTINGS]: state.settings });
      refreshBrowserTranslatorStatus();
      if (state.settings.autoTranslate && state.settings.targetLanguage !== "en") {
        scheduleAutoTranslate(250);
      }
    });
    autoTranslate.addEventListener("change", async () => {
      await applySettings({ autoTranslate: autoTranslate.checked }, { skipAutoTranslate: true });
      await chrome.storage.local.set({ [C.STORAGE_KEYS.SETTINGS]: state.settings });
      if (state.settings.autoTranslate && state.settings.targetLanguage !== "en") {
        scheduleAutoTranslate(250);
      }
    });
    nativeDownload.addEventListener("change", async () => {
      await applySettings({ enableBrowserTranslatorDownloads: nativeDownload.checked }, { skipAutoTranslate: true });
      await chrome.storage.local.set({ [C.STORAGE_KEYS.SETTINGS]: state.settings });
      refreshBrowserTranslatorStatus();
    });

    shadow.querySelector("[data-translate]").addEventListener("click", () => translatePage({ reason: "manual" }));
    shadow.querySelector("[data-restore]").addEventListener("click", restorePage);
    shadow.querySelector("[data-save-correction]").addEventListener("click", saveSelectedCorrection);
    shadow.querySelector("[data-cancel-correction]").addEventListener("click", clearSelectedCorrection);
    shadow.querySelector("[data-correction-list]").addEventListener("change", updateCorrectionPreview);
    shadow.querySelector("[data-delete-correction]").addEventListener("click", deleteSelectedCorrection);
    shadow.querySelector("[data-clear-corrections]").addEventListener("click", clearAllCorrections);
    shadow.querySelector("[data-clear-cache]").addEventListener("click", clearCacheFromPanel);
    shadow.querySelector("[data-collapse]").addEventListener("click", () => {
      setCollapsed(!state.collapsed, { user: true });
      schedulePanelPlacement();
    });

    document.documentElement.append(host);
    state.panel = host;
    state.shadow = shadow;
    updateLanguageSupport();
    updateCorrectionsManager();
    updateDiagnosticsPanel();
    setProviderMode(state.providerMode);
    setCollapsed(true);
    settlePanelPlacement();
    window.requestAnimationFrame(() => {
      const panel = shadow.querySelector(".panel");
      if (panel) panel.dataset.mounted = "true";
    });
    refreshBrowserTranslatorStatus();
  }

  function currentRecords() {
    return state.replacements.filter((record) => record.target && record.target.isConnected);
  }

  function recordTarget(record) {
    return record ? record.target || record.node : null;
  }

  function forgetRecord(record) {
    const target = recordTarget(record);
    if (target) state.nodeRecords.delete(target);
    state.replacements = state.replacements.filter((item) => item !== record);
  }

  function isCurrentRecordStillOwned(record) {
    const target = recordTarget(record);
    if (!target || !target.isConnected) return false;
    return target.textContent === record.translated;
  }

  function shouldSkipRecordedTarget(target) {
    const record = state.nodeRecords.get(target);
    if (!record) return false;
    if (isCurrentRecordStillOwned(record)) return true;
    forgetRecord(record);
    return false;
  }

  function isInsideRecordedElement(node) {
    let current = node && node.parentElement;
    while (current && current !== document.body) {
      if (shouldSkipRecordedTarget(current)) return true;
      current = current.parentElement;
    }
    return false;
  }

  const INLINE_MERGE_SELECTOR = "p, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption";
  const SAFE_INLINE_TAGS = new Set(["B", "EM", "I", "MARK", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "U"]);
  const UNSAFE_INLINE_MERGE_SELECTOR = [
    "button",
    "canvas",
    "code",
    "form",
    "iframe",
    "input",
    "kbd",
    "pre",
    "samp",
    "script",
    "select",
    "svg",
    "textarea",
    "[contenteditable='true']",
    "[role='button']"
  ].join(",");

  function hasOnlySafeInlineContent(element) {
    for (const child of element.children) {
      if (!SAFE_INLINE_TAGS.has(child.tagName)) return false;
      if (child.matches(UNSAFE_INLINE_MERGE_SELECTOR) || child.querySelector(UNSAFE_INLINE_MERGE_SELECTOR))
        return false;
    }
    return true;
  }

  function shouldMergeInlineElement(element) {
    if (!element || !element.matches(INLINE_MERGE_SELECTOR)) return false;
    if (state.nodeRecords.has(element)) return !shouldSkipRecordedTarget(element);
    if (Text.isExcludedElement(element) || !Text.isElementVisible(element)) return false;
    if (!hasOnlySafeInlineContent(element)) return false;
    const textNodes = Array.from(element.childNodes).filter(
      (node) => node.nodeType === Node.TEXT_NODE && Text.normalizeWhitespace(node.textContent)
    );
    if (textNodes.length === 0 || element.children.length === 0) return false;
    return Text.shouldTranslateText(
      element.textContent,
      state.settings.targetLanguage,
      C.LIMITS.maxTextLength,
      element
    );
  }

  function collectInlineElementCandidates() {
    return Array.from(document.body.querySelectorAll(INLINE_MERGE_SELECTOR))
      .filter(shouldMergeInlineElement)
      .map((element) => ({
        kind: "element",
        target: element,
        original: element.innerHTML,
        originalText: element.textContent,
        normalized: Text.normalizeWhitespace(element.textContent)
      }));
  }

  function candidateRect(candidate) {
    const target = candidate && candidate.target;
    if (!target) return null;
    const element = target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
    if (!element || typeof element.getBoundingClientRect !== "function") return null;
    return element.getBoundingClientRect();
  }

  function candidateViewportScore(candidate) {
    const rect = candidateRect(candidate);
    if (!rect) return Number.MAX_SAFE_INTEGER;
    if (rect.bottom >= 0 && rect.top <= window.innerHeight) {
      return Math.max(0, rect.top);
    }
    if (rect.top > window.innerHeight) {
      return 100000 + rect.top - window.innerHeight;
    }
    return 200000 + Math.abs(rect.bottom);
  }

  function sortCandidatesByViewport(candidates) {
    return candidates
      .map((candidate, index) => ({ candidate, index, score: candidateViewportScore(candidate) }))
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .map((item) => item.candidate);
  }

  function collectCandidates() {
    const elementCandidates = collectInlineElementCandidates();
    const nodes = Text.collectTranslatableTextNodes(document.body, {
      targetLanguage: state.settings.targetLanguage,
      maxTextLength: C.LIMITS.maxTextLength,
      maxNodes: C.LIMITS.maxCandidateScanNodes || C.LIMITS.maxTextNodesPerPass,
      scoreNode(node) {
        return candidateViewportScore({ target: node });
      },
      shouldSkipNode(node) {
        return (
          isInsideRecordedElement(node) ||
          elementCandidates.some((candidate) => candidate.target.contains(node)) ||
          shouldSkipRecordedTarget(node)
        );
      }
    });

    const nodeCandidates = nodes
      .filter((node) => !isInsideRecordedElement(node))
      .filter((node) => !elementCandidates.some((candidate) => candidate.target.contains(node)))
      .filter((node) => !shouldSkipRecordedTarget(node))
      .map((node) => ({
        kind: "text",
        target: node,
        node,
        original: node.textContent,
        normalized: Text.normalizeWhitespace(node.textContent)
      }))
      .filter((item) => item.normalized);

    return sortCandidatesByViewport([...elementCandidates, ...nodeCandidates]).slice(0, C.LIMITS.maxTextNodesPerPass);
  }

  function directGlossaryTranslation(prepared) {
    if (!prepared || !prepared.text || !Array.isArray(prepared.placeholders)) return "";
    const token = prepared.text.trim();
    if (!/^__AL_TERM_\d+__$/.test(token)) return "";
    const placeholder = prepared.placeholders.find((item) => item.token === token);
    return placeholder ? placeholder.value : "";
  }

  function appendTextPart(fragment, value) {
    if (value) fragment.append(document.createTextNode(value));
  }

  function inlineChildrenFor(element) {
    return Array.from(element.children).filter(
      (child) =>
        SAFE_INLINE_TAGS.has(child.tagName) &&
        !child.matches(UNSAFE_INLINE_MERGE_SELECTOR) &&
        !child.querySelector(UNSAFE_INLINE_MERGE_SELECTOR) &&
        Text.normalizeWhitespace(child.textContent)
    );
  }

  function prepareInlinePlaceholders(candidate, prepared) {
    if (!candidate || candidate.kind !== "element" || !candidate.target || !prepared) return prepared;

    const glossaryValues = new Set((prepared.placeholders || []).map((item) => Text.normalizeWhitespace(item.value)));
    const inlinePlaceholders = [];
    let text = prepared.text;
    for (const child of inlineChildrenFor(candidate.target)) {
      const childText = Text.normalizeWhitespace(child.textContent);
      if (!childText || glossaryValues.has(childText)) continue;

      const index = text.indexOf(childText);
      if (index === -1) continue;

      const token = `__AL_INLINE_${inlinePlaceholders.length}__`;
      text = `${text.slice(0, index)}${token}${text.slice(index + childText.length)}`;
      inlinePlaceholders.push({
        token,
        value: childText,
        child
      });
    }

    if (!inlinePlaceholders.length) return prepared;
    return {
      ...prepared,
      text,
      inlinePlaceholders
    };
  }

  function createInlineTokenFragment(translated, inlinePlaceholders) {
    if (!Array.isArray(inlinePlaceholders) || inlinePlaceholders.length === 0) return null;

    const tokens = new Map(inlinePlaceholders.map((item) => [item.token, item]));
    const pattern = new RegExp(
      inlinePlaceholders.map((item) => item.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
      "g"
    );
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let preserved = 0;
    for (const match of translated.matchAll(pattern)) {
      appendTextPart(fragment, translated.slice(cursor, match.index));
      const placeholder = tokens.get(match[0]);
      if (placeholder && placeholder.child) {
        const clone = placeholder.child.cloneNode(false);
        clone.textContent = placeholder.value;
        fragment.append(clone);
        preserved += 1;
      } else {
        appendTextPart(fragment, match[0]);
      }
      cursor = match.index + match[0].length;
    }
    appendTextPart(fragment, translated.slice(cursor));

    return preserved > 0 ? fragment : null;
  }

  function createInlinePreservingFragment(element, translated) {
    const inlineChildren = inlineChildrenFor(element);
    if (!inlineChildren.length) return null;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let preserved = 0;
    for (const child of inlineChildren) {
      const childText = Text.normalizeWhitespace(child.textContent);
      const index = translated.indexOf(childText, cursor);
      if (index === -1) continue;

      appendTextPart(fragment, translated.slice(cursor, index));
      const clone = child.cloneNode(false);
      clone.textContent = translated.slice(index, index + childText.length);
      fragment.append(clone);
      cursor = index + childText.length;
      preserved += 1;
    }

    if (preserved === 0) return null;
    appendTextPart(fragment, translated.slice(cursor));
    return fragment;
  }

  function applyTranslatedElement(element, translated, inlinePlaceholders) {
    const fragment =
      createInlineTokenFragment(translated, inlinePlaceholders) || createInlinePreservingFragment(element, translated);
    if (fragment) {
      element.replaceChildren(fragment);
      return;
    }
    element.textContent = translated;
  }

  function applyCandidateTranslation(candidate, translated, inlinePlaceholders) {
    if (!candidate || !candidate.target || !candidate.target.isConnected) return false;
    if (Text.normalizeWhitespace(candidate.target.textContent) !== candidate.normalized) return false;
    if (!translated || translated === candidate.normalized) return false;

    const record = {
      kind: candidate.kind,
      target: candidate.target,
      node: candidate.node || null,
      original: candidate.original,
      originalText: candidate.originalText || candidate.original,
      normalized: candidate.normalized,
      translated,
      hash: Text.stableHash(candidate.normalized)
    };
    state.nodeRecords.set(candidate.target, record);
    state.replacements.push(record);
    suppressMutationReactions();
    if (candidate.kind === "element") {
      applyTranslatedElement(candidate.target, translated, inlinePlaceholders);
    } else {
      Text.applyTranslatedText(candidate.target, translated);
    }
    return true;
  }

  function recordMatchesClickedElement(record, element) {
    if (!record || !element) return false;
    const target = recordTarget(record);
    if (!target || !target.isConnected) return false;
    if (target.nodeType === Node.TEXT_NODE) {
      return element.contains(target);
    }
    return target === element || target.contains(element);
  }

  function recordForClickedElement(element) {
    if (!element || (state.panel && state.panel.contains(element))) return null;
    return currentRecords().find((record) => recordMatchesClickedElement(record, element)) || null;
  }

  function updateCorrectionPanel() {
    if (!state.shadow) return;
    const panel = state.shadow.querySelector("[data-correction]");
    const input = state.shadow.querySelector("[data-correction-input]");
    if (!panel || !input) return;
    const record = state.selectedCorrection;
    panel.dataset.active = String(Boolean(record));
    if (record) {
      input.value = record.translated || "";
      input.dataset.original = record.normalized || "";
    } else {
      input.value = "";
      input.dataset.original = "";
    }
  }

  function selectCorrectionRecord(record) {
    state.selectedCorrection = record || null;
    updateCorrectionPanel();
  }

  function clearSelectedCorrection() {
    state.selectedCorrection = null;
    updateCorrectionPanel();
  }

  function applyCorrectionToRecord(record, translated) {
    const target = recordTarget(record);
    if (!target || !target.isConnected) return false;
    record.translated = translated;
    suppressMutationReactions();
    if (record.kind === "element") {
      applyTranslatedElement(target, translated);
    } else {
      target.textContent = translated;
    }
    return true;
  }

  async function saveSelectedCorrection() {
    if (!state.selectedCorrection || !state.shadow) return;
    const input = state.shadow.querySelector("[data-correction-input]");
    const translated = Text.normalizeWhitespace(input ? input.value : "");
    if (!translated) return;

    const record = state.selectedCorrection;
    if (!applyCorrectionToRecord(record, translated)) {
      clearSelectedCorrection();
      return;
    }

    const persisted = await persistCorrection(record, translated);
    setProviderMode("local");
    setStatus(
      persisted
        ? message("status.translated", { count: currentRecords().length })
        : message("status.translatedPartial", { count: currentRecords().length, failed: 1 }),
      persisted ? "ok" : "error"
    );
    clearSelectedCorrection();
  }

  function handleCorrectionClick(event) {
    const element = mutationElement(event.target);
    const record = recordForClickedElement(element);
    if (record) {
      selectCorrectionRecord(record);
    }
  }

  function chunks(values, size) {
    const result = [];
    for (let index = 0; index < values.length; index += size) {
      result.push(values.slice(index, index + size));
    }
    return result;
  }

  function candidateElement(candidate) {
    const target = candidate && candidate.target;
    return target && target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
  }

  function candidateContextKey(candidate) {
    const element = candidateElement(candidate);
    const context = element?.closest?.("[data-testid], article, section, main") || element?.parentElement || element;
    if (!context) return "page";
    return [
      context.tagName || "node",
      context.id || "",
      context.getAttribute?.("data-testid") || "",
      context.getAttribute?.("aria-label") || ""
    ].join(":");
  }

  function appendContextText(groups, seen, candidate, text) {
    if (!text || seen.has(text)) return;
    seen.add(text);
    const key = candidateContextKey(candidate);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(text);
  }

  function orderedContextTexts(groups) {
    return Array.from(groups.values()).flat();
  }

  function mergeDiagnostics(target, source) {
    if (!source) return target;
    target.cacheHits += source.cacheHits || 0;
    target.cacheMisses += source.cacheMisses || 0;
    target.fallbackTexts += source.fallbackTexts || 0;
    target.corrections += source.corrections || 0;
    target.contextGroups += source.contextGroups || 0;
    target.frames += source.frames || 0;
    if (source.provider) target.provider = source.provider;
    return target;
  }

  function diagnosticsFromResponse(response, requestedCount) {
    const stats = (response && response.stats) || {};
    const fallbackStats = stats.fallback || null;
    return {
      cacheHits: stats.cacheHits || 0,
      cacheMisses: stats.cacheMisses || 0,
      fallbackTexts: fallbackStats
        ? fallbackStats.requested || requestedCount || 0
        : stats.fallback
          ? requestedCount || 0
          : 0,
      corrections: 0,
      contextGroups: 0,
      frames: 0,
      provider: stats.provider || (fallbackStats ? "mixed" : state.providerMode)
    };
  }

  async function translateCandidatePass({ generation, targetLanguage, pageUrl, glossary, childFrameCount = 0 }) {
    const candidates = collectCandidates();
    const reachedLimit = candidates.length >= (C.LIMITS.maxTextNodesPerPass || 120);
    if (candidates.length === 0) {
      return { applied: 0, failed: 0, childFrameCount, hadCandidates: false, reachedLimit: false };
    }

    const corrections = await loadCorrections();
    const baseScope = cacheScope("runtime", glossary, corrections);
    const seenTexts = new Set();
    const contextGroups = new Map();
    const preparedByCandidate = new Map();
    const directByCandidate = new Map();
    const diagnostics = {
      cacheHits: 0,
      cacheMisses: 0,
      fallbackTexts: 0,
      corrections: 0,
      contextGroups: 0,
      frames: 0,
      provider: ""
    };
    for (const candidate of candidates) {
      const correction = correctionFor(corrections, targetLanguage, candidate.normalized);
      if (correction) {
        directByCandidate.set(candidate, correction);
        diagnostics.corrections += 1;
        continue;
      }
      const prepared = Glossary.prepareForTranslation(candidate.normalized, glossary, targetLanguage);
      const inlinePrepared = prepareInlinePlaceholders(candidate, prepared);
      preparedByCandidate.set(candidate, inlinePrepared);
      const direct = directGlossaryTranslation(inlinePrepared);
      if (direct) {
        directByCandidate.set(candidate, direct);
        continue;
      }
      appendContextText(contextGroups, seenTexts, candidate, inlinePrepared.text);
    }
    diagnostics.contextGroups = contextGroups.size;

    let applied = 0;
    for (const candidate of candidates) {
      if (!isCurrentGeneration(generation, targetLanguage, pageUrl)) return;
      const directTranslation = directByCandidate.get(candidate);
      if (directTranslation && applyCandidateTranslation(candidate, directTranslation)) {
        applied += 1;
      }
    }

    let response = { ok: true, translated: {}, errors: {}, stats: { failed: 0 } };
    if (seenTexts.size > 0) {
      const texts = orderedContextTexts(contextGroups);
      const textChunks = chunks(texts, C.LIMITS.maxBatchSize || 40);
      setStatus(message("status.translating", { count: texts.length }));
      setProgress(15);
      setBusy(true, generation);
      try {
        for (let index = 0; index < textChunks.length; index += 1) {
          if (!isCurrentGeneration(generation, targetLanguage, pageUrl)) return;
          const chunkResponse = await sendTranslationBatch(
            {
              type: C.MESSAGE_TYPES.TRANSLATE_BATCH,
              targetLanguage,
              texts: textChunks[index],
              cacheScope: baseScope
            },
            90000
          );
          if (!chunkResponse || !chunkResponse.ok) {
            response.ok = false;
            response.error = chunkResponse && chunkResponse.error ? chunkResponse.error : message("status.failed");
            break;
          }
          Object.assign(response.translated, chunkResponse.translated || {});
          Object.assign(response.errors, chunkResponse.errors || {});
          response.stats.failed += chunkResponse.stats && chunkResponse.stats.failed ? chunkResponse.stats.failed : 0;
          mergeDiagnostics(diagnostics, diagnosticsFromResponse(chunkResponse, textChunks[index].length));
          setProgress(15 + Math.round(((index + 1) / textChunks.length) * 50));
        }
      } catch (error) {
        return { applied, failed: 1, childFrameCount, hadCandidates: true, reachedLimit, error, diagnostics };
      } finally {
        setBusy(false, generation);
      }
    }

    if (!isCurrentGeneration(generation, targetLanguage, pageUrl)) return;
    setProgress(65);

    if (!response || !response.ok) {
      return {
        applied,
        failed: 1,
        childFrameCount,
        hadCandidates: true,
        reachedLimit,
        error: response && response.error ? response.error : message("status.failed"),
        diagnostics
      };
    }

    for (const candidate of candidates) {
      if (!isCurrentGeneration(generation, targetLanguage, pageUrl)) return;
      if (directByCandidate.has(candidate)) continue;

      const prepared = preparedByCandidate.get(candidate);
      if (!prepared) continue;
      const rawTranslation = response.translated[prepared.text];
      if (!rawTranslation) continue;

      const translated = Glossary.restoreProtectedTerms(rawTranslation, prepared.placeholders);
      if (applyCandidateTranslation(candidate, translated, prepared.inlinePlaceholders)) {
        applied += 1;
      }
    }

    const failed = response.errors ? Object.keys(response.errors).length : 0;
    return { applied, failed, childFrameCount, hadCandidates: true, reachedLimit, diagnostics };
  }

  function enqueueTranslation(options = {}, delay = 0) {
    return new Promise((resolve) => {
      state.translationQueue.pending = {
        ...(state.translationQueue.pending || {}),
        ...(options || {})
      };
      state.translationQueue.resolvers.push(resolve);
      window.clearTimeout(state.translationQueue.timer);
      state.translationQueue.timer = window.setTimeout(runTranslationQueue, Math.max(0, delay || 0));
    });
  }

  function cancelQueuedTranslation() {
    window.clearTimeout(state.translationQueue.timer);
    state.translationQueue.pending = null;
    const resolvers = state.translationQueue.resolvers.splice(0);
    for (const resolve of resolvers) resolve(undefined);
  }

  async function runTranslationQueue() {
    if (state.translationQueue.active) return;
    const options = state.translationQueue.pending || {};
    if (!state.translationQueue.pending) return;
    const resolvers = state.translationQueue.resolvers.splice(0);
    state.translationQueue.pending = null;
    state.translationQueue.active = true;

    let result;
    try {
      result = await performTranslatePage(options);
    } finally {
      state.translationQueue.active = false;
      for (const resolve of resolvers) resolve(result);
      if (state.translationQueue.pending) {
        state.translationQueue.timer = window.setTimeout(runTranslationQueue, 0);
      }
    }
  }

  function translatePage(options = {}) {
    return enqueueTranslation(options, options.delay || 0);
  }

  async function performTranslatePage(options = {}) {
    const generation = bumpGeneration();
    const targetLanguage = state.settings.targetLanguage;
    const pageUrl = location.href;
    const shouldBroadcastFrames = isTopFrame && options.broadcastFrames !== false;

    if (targetLanguage === "en") {
      return restorePage({ bump: false, broadcastFrames: shouldBroadcastFrames });
    }

    let glossary;
    try {
      glossary = await ensureGlossary(targetLanguage);
    } catch (error) {
      setStatus(error.message || message("status.glossaryLoading"), "error");
      return;
    }

    const frameDispatch = shouldBroadcastFrames
      ? postToChildFrames("translate", { targetLanguage })
      : { payload: null, sent: 0 };
    const childFrameCount = frameDispatch.sent;
    startFrameAggregate(frameDispatch.payload, childFrameCount, "translate");
    const maxPasses = Math.max(1, C.LIMITS.maxTranslationPasses || 1);
    let applied = 0;
    let failed = 0;
    let capped = false;
    let firstError = "";
    const diagnostics = {
      cacheHits: 0,
      cacheMisses: 0,
      fallbackTexts: 0,
      corrections: 0,
      contextGroups: 0,
      frames: childFrameCount,
      provider: ""
    };

    for (let passIndex = 0; passIndex < maxPasses; passIndex += 1) {
      if (!isCurrentGeneration(generation, targetLanguage, pageUrl)) return;

      const result = await translateCandidatePass({
        generation,
        targetLanguage,
        pageUrl,
        glossary,
        childFrameCount: passIndex === 0 ? childFrameCount : 0
      });
      if (!result) return;

      applied += result.applied || 0;
      failed += result.failed || 0;
      mergeDiagnostics(diagnostics, result.diagnostics);
      if (!firstError && result.error) {
        firstError = result.error.message || String(result.error);
      }

      if (!result.hadCandidates || result.failed > 0 || result.applied === 0 || !result.reachedLimit) {
        capped = false;
        break;
      }

      capped = passIndex === maxPasses - 1;
      if (!capped) {
        setProgress(Math.min(95, 65 + Math.round(((passIndex + 1) / maxPasses) * 25)));
        await sleep(0);
      }
    }

    if (!isCurrentGeneration(generation, targetLanguage, pageUrl)) return;

    if (capped) {
      capped = collectCandidates().length > 0;
    }

    if (failed > 0) {
      setProgress(0);
      state.lastDiagnostics = diagnostics;
      updateDiagnosticsPanel();
      updateFrameAggregatePage(frameDispatch.payload && frameDispatch.payload.messageId, { applied, failed });
      setStatus(
        applied > 0
          ? message("status.translatedPartial", { count: applied, failed })
          : firstError || message("status.failed"),
        "error"
      );
      return { applied, failed, childFrameCount, capped };
    }

    setProgress(applied > 0 ? 100 : 0);
    state.lastDiagnostics = diagnostics;
    updateDiagnosticsPanel();
    updateFrameAggregatePage(frameDispatch.payload && frameDispatch.payload.messageId, { applied, failed });
    if (capped) {
      setStatus(message("status.translatedCapped", { count: applied }), "ok");
    } else if (childFrameCount > 0) {
      setAggregateStatus(state.frameAggregates.get(frameDispatch.payload.messageId));
      if (applied === 0) setStatus(message("status.frameDispatch"), "ok");
    } else if (applied > 0) {
      setStatus(message("status.translated", { count: applied }), "ok");
    } else {
      setStatus(childFrameCount > 0 ? message("status.frameDispatch") : message("status.noNewText"), "ok");
    }

    return { applied, failed, childFrameCount, capped };
  }

  function restorePage(options = {}) {
    if (options.bump !== false) bumpGeneration();
    window.clearTimeout(state.debounceTimer);
    cancelQueuedTranslation();
    clearFrameAggregates();
    if (isTopFrame && options.broadcastFrames !== false) {
      postToChildFrames("restore");
    }
    let restored = 0;
    suppressMutationReactions();
    for (const record of currentRecords()) {
      const target = recordTarget(record);
      if (!target || !target.isConnected) continue;
      if (isCurrentRecordStillOwned(record)) {
        if (record.kind === "element") {
          target.innerHTML = record.original;
        } else {
          target.textContent = record.original;
        }
        restored += 1;
      }
      state.nodeRecords.delete(target);
    }
    state.replacements = [];
    state.nodeRecords = new WeakMap();
    clearSelectedCorrection();
    setBusy(false);
    setProgress(0);
    schedulePanelPlacement();
    if (!options.silent) {
      setStatus(message("status.restored", { count: restored }), "ok");
    }
    return { restored };
  }

  function scheduleAutoTranslate(delay) {
    window.clearTimeout(state.debounceTimer);
    state.debounceTimer = window.setTimeout(() => translatePage({ reason: "auto" }), delay);
  }

  function handleRouteChange() {
    if (location.href === state.lastUrl) return false;
    state.lastUrl = location.href;
    state.routeVersion += 1;
    clearFrameAggregates();
    bumpGeneration();
    restorePage({ bump: false, silent: true });
    setStatus(message("status.ready"));
    settlePanelPlacement();
    if (state.settings.autoTranslate && state.settings.targetLanguage !== "en") {
      scheduleAutoTranslate(900);
    }
    return true;
  }

  function mutationElement(node) {
    if (!node) return null;
    if (node.nodeType === Node.ELEMENT_NODE) return node;
    return node.parentElement || null;
  }

  function isPanelMutation(node) {
    const element = mutationElement(node);
    return Boolean(element && state.panel && (element === state.panel || state.panel.contains(element)));
  }

  function textNodeMayNeedTranslation(node) {
    const parent = node && node.parentElement;
    if (!parent || Text.isExcludedElement(parent) || !Text.isElementVisible(parent)) return false;
    return Text.shouldTranslateText(node.textContent, state.settings.targetLanguage, C.LIMITS.maxTextLength, parent);
  }

  function elementMayContainTranslatableText(element) {
    if (!element || Text.isExcludedElement(element) || !Text.isElementVisible(element)) return false;
    if (element.tagName === "IFRAME" || element.querySelector?.("iframe")) return true;

    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && textNodeMayNeedTranslation(child)) return true;
    }

    return Boolean(
      Array.from(element.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption")).some(
        (candidate) =>
          !Text.isExcludedElement(candidate) &&
          Text.isElementVisible(candidate) &&
          Text.shouldTranslateText(
            candidate.textContent,
            state.settings.targetLanguage,
            C.LIMITS.maxTextLength,
            candidate
          )
      )
    );
  }

  function reconcileMutations(mutations) {
    let sawFrameMutation = false;
    let sawTranslatableMutation = false;
    for (const mutation of mutations) {
      if (isPanelMutation(mutation.target)) continue;

      if (mutation.type === "characterData") {
        const nodeRecord = state.nodeRecords.get(mutation.target);
        if (nodeRecord && !isCurrentRecordStillOwned(nodeRecord)) {
          forgetRecord(nodeRecord);
          sawTranslatableMutation = true;
        } else if (!nodeRecord && textNodeMayNeedTranslation(mutation.target)) {
          sawTranslatableMutation = true;
        }
        let parent = mutation.target.parentElement;
        while (parent && parent !== document.body) {
          const elementRecord = state.nodeRecords.get(parent);
          if (elementRecord && !isCurrentRecordStillOwned(elementRecord)) {
            forgetRecord(elementRecord);
            sawTranslatableMutation = true;
            break;
          }
          parent = parent.parentElement;
        }
      }

      if (mutation.type === "childList") {
        if (mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE) {
          const elementRecord = state.nodeRecords.get(mutation.target);
          if (elementRecord && !isCurrentRecordStillOwned(elementRecord)) {
            forgetRecord(elementRecord);
            sawTranslatableMutation = true;
          }
        }
        for (const node of mutation.addedNodes || []) {
          if (isPanelMutation(node)) continue;
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.tagName === "IFRAME" || node.querySelector?.("iframe")) {
            sawFrameMutation = true;
          }
          if (elementMayContainTranslatableText(node)) {
            sawTranslatableMutation = true;
          }
        }
      }
    }

    if (sawFrameMutation) {
      window.setTimeout(() => dispatchPendingFrameCommand(), 80);
    }
    return { sawFrameMutation, sawTranslatableMutation };
  }

  function watchSpaNavigation() {
    state.observer = new MutationObserver((mutations) => {
      const signal = reconcileMutations(mutations);
      const routeChanged = handleRouteChange();
      if (Date.now() < state.suppressMutationUntil) return;
      if (signal.sawFrameMutation || signal.sawTranslatableMutation || routeChanged) {
        schedulePanelPlacement();
      }

      if (!state.settings.autoTranslate || routeChanged || !signal.sawTranslatableMutation) return;
      scheduleAutoTranslate(800);
    });

    state.observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  async function applySettings(nextSettings, options = {}) {
    const previousLanguage = state.settings.targetLanguage;
    const previousAutoTranslate = state.settings.autoTranslate;
    const previousNativeDownloads = state.settings.enableBrowserTranslatorDownloads;
    state.settings = {
      ...C.DEFAULT_SETTINGS,
      ...state.settings,
      ...(nextSettings || {})
    };

    if (state.shadow) {
      const language = state.shadow.querySelector("[data-language]");
      const autoTranslate = state.shadow.querySelector("[data-auto-translate]");
      const nativeDownload = state.shadow.querySelector("[data-native-download]");
      if (language && language.value !== state.settings.targetLanguage) language.value = state.settings.targetLanguage;
      if (autoTranslate) autoTranslate.checked = Boolean(state.settings.autoTranslate);
      if (nativeDownload) nativeDownload.checked = Boolean(state.settings.enableBrowserTranslatorDownloads);
      updateLanguageSupport();
    }

    if (previousLanguage !== state.settings.targetLanguage) {
      refreshBrowserTranslatorStatus();
      bumpGeneration();
      restorePage({ bump: false, silent: true });
      try {
        await ensureGlossary(state.settings.targetLanguage);
        setStatus(message("status.targetLanguage", { language: languageLabel(state.settings.targetLanguage) }));
      } catch (error) {
        setStatus(error.message || message("status.failed"), "error");
        return;
      }
    }

    if (previousNativeDownloads !== state.settings.enableBrowserTranslatorDownloads) {
      refreshBrowserTranslatorStatus();
    }

    if (
      !options.skipAutoTranslate &&
      state.settings.autoTranslate &&
      state.settings.targetLanguage !== "en" &&
      (previousLanguage !== state.settings.targetLanguage || previousAutoTranslate !== state.settings.autoTranslate)
    ) {
      scheduleAutoTranslate(250);
    }
  }

  function watchSettingsChanges() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[C.STORAGE_KEYS.SETTINGS]) return;
      applySettings(changes[C.STORAGE_KEYS.SETTINGS].newValue);
    });
  }

  function watchHistoryNavigation() {
    if (history.pushState.__academylensWrapped) return;
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function pushStateWithAcademyLens() {
      const result = originalPushState.apply(this, arguments);
      window.setTimeout(handleRouteChange, 0);
      return result;
    };
    history.replaceState = function replaceStateWithAcademyLens() {
      const result = originalReplaceState.apply(this, arguments);
      window.setTimeout(handleRouteChange, 0);
      return result;
    };
    history.pushState.__academylensWrapped = true;
    history.replaceState.__academylensWrapped = true;

    window.addEventListener("popstate", handleRouteChange);
    window.addEventListener("hashchange", handleRouteChange);
    window.addEventListener("resize", () => schedulePanelPlacement());
    window.addEventListener("scroll", () => schedulePanelPlacement(120), { passive: true });
    window.addEventListener("pagehide", () => {
      state.observer?.disconnect();
      clearFrameAggregates();
      window.clearTimeout(state.debounceTimer);
      window.clearTimeout(state.translationQueue.timer);
      window.clearTimeout(state.placementTimer);
      if (state.placementFrame) {
        window.cancelAnimationFrame(state.placementFrame);
        state.placementFrame = 0;
      }
      for (const timer of state.placementSettleTimers) {
        window.clearTimeout(timer);
      }
    });
  }

  try {
    await loadSettings();
    await loadGlossaryIndex();
    await loadCorrections();
    await ensureGlossary(state.settings.targetLanguage);
    if (isTopFrame) {
      createPanel();
    }
    watchFrameMessages();
    watchHistoryNavigation();
    watchSpaNavigation();
    watchSettingsChanges();
    document.addEventListener("click", handleCorrectionClick, true);
    postFrameReady();
    if (state.settings.autoTranslate) {
      scheduleAutoTranslate(600);
    }
  } catch (error) {
    console.warn("[AcademyLens]", error);
  }
})();
