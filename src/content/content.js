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
    handledFrameMessages: new Set(),
    browserTranslatorStatus: "unchecked",
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

  async function refreshBrowserTranslatorStatus() {
    if (!isTopFrame || !BrowserTranslator || typeof BrowserTranslator.availability !== "function") {
      setBrowserTranslatorStatus("unsupported");
      return;
    }

    const targetLanguage = state.settings.targetLanguage;
    if (!targetLanguage || targetLanguage === "en") {
      setBrowserTranslatorStatus("unavailable");
      return;
    }

    setBrowserTranslatorStatus("checking");
    const result = await BrowserTranslator.availability({
      sourceLanguage: "en",
      targetLanguage
    });
    if (targetLanguage !== state.settings.targetLanguage) return;
    setBrowserTranslatorStatus(result.status);
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

  async function translateBatchInContent(texts, targetLanguage) {
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
          const result = await translateTextInContent(text, targetLanguage);
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

  async function sendTranslationBatch(payload, timeoutMs) {
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

    return translateBatchInContent(payload.texts || [], payload.targetLanguage);
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
      generation: extra.generation || state.generation
    };
  }

  function rememberFrameCommand(payload) {
    if (!payload || !["translate", "restore"].includes(payload.action)) return;
    state.latestFrameCommand = payload;
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

  function postFrameResult(kind, result = {}) {
    if (isTopFrame || !window.top) return;
    window.top.postMessage(
      {
        source: FRAME_MESSAGE_SOURCE,
        action: "frameResult",
        kind,
        applied: result.applied || 0,
        failed: result.failed || 0
      },
      location.origin
    );
  }

  function handleFrameResult(data) {
    if (!isTopFrame || !data || data.action !== "frameResult") return;
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
            <label class="toggle">
              <input type="checkbox" data-auto-translate />
              <span>${message("panel.autoTranslate")}</span>
            </label>
            <div class="progress" data-progress role="progressbar" aria-label="${message("progress.translation")}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
          </div>
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

    shadow.querySelector("[data-translate]").addEventListener("click", () => translatePage());
    shadow.querySelector("[data-restore]").addEventListener("click", restorePage);
    shadow.querySelector("[data-collapse]").addEventListener("click", () => {
      setCollapsed(!state.collapsed, { user: true });
      schedulePanelPlacement();
    });

    document.documentElement.append(host);
    state.panel = host;
    state.shadow = shadow;
    updateLanguageSupport();
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
      .slice(0, C.LIMITS.maxTextNodesPerPass)
      .map((element) => ({
        kind: "element",
        target: element,
        original: element.innerHTML,
        originalText: element.textContent,
        normalized: Text.normalizeWhitespace(element.textContent)
      }));
  }

  function collectCandidates() {
    const elementCandidates = collectInlineElementCandidates();
    const nodes = Text.collectTranslatableTextNodes(document.body, {
      targetLanguage: state.settings.targetLanguage,
      maxTextLength: C.LIMITS.maxTextLength,
      maxNodes: C.LIMITS.maxTextNodesPerPass
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

    return [...elementCandidates, ...nodeCandidates].slice(0, C.LIMITS.maxTextNodesPerPass);
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

  function createInlinePreservingFragment(element, translated) {
    const inlineChildren = Array.from(element.children).filter(
      (child) =>
        SAFE_INLINE_TAGS.has(child.tagName) &&
        !child.matches(UNSAFE_INLINE_MERGE_SELECTOR) &&
        !child.querySelector(UNSAFE_INLINE_MERGE_SELECTOR) &&
        Text.normalizeWhitespace(child.textContent)
    );
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

  function applyTranslatedElement(element, translated) {
    const fragment = createInlinePreservingFragment(element, translated);
    if (fragment) {
      element.replaceChildren(fragment);
      return;
    }
    element.textContent = translated;
  }

  function applyCandidateTranslation(candidate, translated) {
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
      applyTranslatedElement(candidate.target, translated);
    } else {
      Text.applyTranslatedText(candidate.target, translated);
    }
    return true;
  }

  function chunks(values, size) {
    const result = [];
    for (let index = 0; index < values.length; index += size) {
      result.push(values.slice(index, index + size));
    }
    return result;
  }

  async function translatePage(options = {}) {
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

    const childFrameCount = shouldBroadcastFrames ? postToChildFrames("translate", { targetLanguage }).sent : 0;
    const candidates = collectCandidates();
    if (candidates.length === 0) {
      setStatus(childFrameCount > 0 ? message("status.frameDispatch") : message("status.noNewText"), "ok");
      return { applied: 0, failed: 0, childFrameCount };
    }

    const unique = new Map();
    const preparedByOriginal = new Map();
    const directByOriginal = new Map();
    for (const candidate of candidates) {
      if (unique.has(candidate.normalized)) continue;
      const prepared = Glossary.prepareForTranslation(candidate.normalized, glossary, targetLanguage);
      preparedByOriginal.set(candidate.normalized, prepared);
      const direct = directGlossaryTranslation(prepared);
      if (direct) {
        directByOriginal.set(candidate.normalized, direct);
        continue;
      }
      unique.set(candidate.normalized, prepared.text);
    }

    let applied = 0;
    for (const candidate of candidates) {
      if (!isCurrentGeneration(generation, targetLanguage, pageUrl)) return;
      const directTranslation = directByOriginal.get(candidate.normalized);
      if (directTranslation && applyCandidateTranslation(candidate, directTranslation)) {
        applied += 1;
      }
    }

    let response = { ok: true, translated: {}, errors: {}, stats: { failed: 0 } };
    if (unique.size > 0) {
      const texts = [...unique.values()];
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
              texts: textChunks[index]
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
          setProgress(15 + Math.round(((index + 1) / textChunks.length) * 50));
        }
      } catch (error) {
        if (isCurrentGeneration(generation, targetLanguage, pageUrl)) {
          setProgress(0);
          setStatus(
            applied > 0
              ? message("status.translatedPartial", { count: applied, failed: 1 })
              : error.message || message("status.failed"),
            "error"
          );
        }
        return { applied, failed: 1, childFrameCount };
      } finally {
        setBusy(false, generation);
      }
    }

    if (!isCurrentGeneration(generation, targetLanguage, pageUrl)) return;
    setProgress(65);

    if (!response || !response.ok) {
      setProgress(0);
      setStatus(
        applied > 0
          ? message("status.translatedPartial", { count: applied, failed: 1 })
          : response && response.error
            ? response.error
            : message("status.failed"),
        "error"
      );
      return { applied, failed: 1, childFrameCount };
    }

    for (const candidate of candidates) {
      if (!isCurrentGeneration(generation, targetLanguage, pageUrl)) return;
      if (directByOriginal.has(candidate.normalized)) continue;

      const prepared = preparedByOriginal.get(candidate.normalized);
      const rawTranslation = response.translated[prepared.text];
      if (!rawTranslation) continue;

      const translated = Glossary.restoreProtectedTerms(rawTranslation, prepared.placeholders);
      if (applyCandidateTranslation(candidate, translated)) {
        applied += 1;
      }
    }

    const failed = response.errors ? Object.keys(response.errors).length : 0;
    setProgress(100);
    setStatus(
      failed > 0
        ? message("status.translatedPartial", { count: applied, failed })
        : message("status.translated", { count: applied }),
      failed > 0 ? "error" : "ok"
    );
    return { applied, failed, childFrameCount };
  }

  function restorePage(options = {}) {
    if (options.bump !== false) bumpGeneration();
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
    state.debounceTimer = window.setTimeout(() => translatePage(), delay);
  }

  function handleRouteChange() {
    if (location.href === state.lastUrl) return false;
    state.lastUrl = location.href;
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
    state.settings = {
      ...C.DEFAULT_SETTINGS,
      ...state.settings,
      ...(nextSettings || {})
    };

    if (state.shadow) {
      const language = state.shadow.querySelector("[data-language]");
      const autoTranslate = state.shadow.querySelector("[data-auto-translate]");
      if (language && language.value !== state.settings.targetLanguage) language.value = state.settings.targetLanguage;
      if (autoTranslate) autoTranslate.checked = Boolean(state.settings.autoTranslate);
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
      window.clearTimeout(state.debounceTimer);
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
    await ensureGlossary(state.settings.targetLanguage);
    if (isTopFrame) {
      createPanel();
    }
    watchFrameMessages();
    watchHistoryNavigation();
    watchSpaNavigation();
    watchSettingsChanges();
    postFrameReady();
    if (state.settings.autoTranslate) {
      scheduleAutoTranslate(600);
    }
  } catch (error) {
    console.warn("[AcademyLens]", error);
  }
})();
