(async function initAcademyLens() {
  "use strict";

  const C = globalThis.AcademyLensConstants;
  const Cache = globalThis.AcademyLensCache;
  const GoogleTranslate = globalThis.AcademyLensGoogleTranslate;
  const Glossary = globalThis.AcademyLensGlossary;
  const Text = globalThis.AcademyLensTextUtils;
  const uiLocale = C && C.getUiLocale ? C.getUiLocale(navigator.language) : "en";
  const FRAME_MESSAGE_SOURCE = "AcademyLens";
  const BACKGROUND_FALLBACK_DELAY_MS = 1200;
  const BACKGROUND_RESPONSE_TIMEOUT_MS = 12000;
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
    placementSettleTimers: [],
    latestFrameCommand: null,
    handledFrameMessages: new Set(),
    collapsed: false,
    collapseUserSet: false
  };

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

  function setBusy(isBusy, generation) {
    if (generation && generation !== state.generation) return;
    if (!state.shadow) return;
    const panel = state.shadow.querySelector(".panel");
    if (!panel) return;
    panel.setAttribute("aria-busy", String(Boolean(isBusy)));
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
    toggle.textContent = state.collapsed ? "+" : "-";
    toggle.setAttribute("aria-expanded", String(!state.collapsed));
    toggle.setAttribute("aria-label", state.collapsed ? message("action.expand") : message("action.collapse"));
  }

  function sendMessage(message, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        settled = true;
        reject(new Error(C.getMessage("status.timeout", uiLocale)));
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
          const response = await fetch(GoogleTranslate.buildGoogleTranslateUrl(text, targetLanguage));
          if (!response.ok) {
            throw new Error(`Google Translate request failed with ${response.status}`);
          }
          const result = GoogleTranslate.parseGoogleTranslatePayload(await response.json());
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
    const backgroundTimeout = Math.min(timeoutMs || BACKGROUND_RESPONSE_TIMEOUT_MS, BACKGROUND_RESPONSE_TIMEOUT_MS);
    const background = sendMessage(payload, backgroundTimeout)
      .then((response) => ({ source: "background", response }))
      .catch((error) => ({ source: "backgroundError", error }));

    const fallback = new Promise((resolve) => {
      window.setTimeout(resolve, BACKGROUND_FALLBACK_DELAY_MS);
    }).then(() =>
      translateBatchInContent(payload.texts || [], payload.targetLanguage)
        .then((response) => ({ source: "fallback", response }))
        .catch((error) => ({ source: "fallbackError", error }))
    );

    const first = await Promise.race([background, fallback]);
    if (first.source === "background" && first.response) return first.response;
    if (first.source === "fallback" && first.response) return first.response;

    const second = first.source === "backgroundError" ? await fallback : await background;
    if (second.source === "background" || second.source === "fallback") return second.response;
    throw second.error || first.error || new Error(message("status.failed"));
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

  function looksLikeBottomOverlay(element, rect) {
    if (!element || element === state.panel || state.panel?.contains(element)) return false;
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

  function updatePanelPlacement() {
    if (!state.panel || !state.shadow) return;
    const panel = state.shadow.querySelector(".panel");
    if (!panel) return;

    const baseGap = 14;
    let offset = 0;

    for (const element of document.body.querySelectorAll("*")) {
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

  function schedulePanelPlacement(delay = 80) {
    window.clearTimeout(state.placementTimer);
    state.placementTimer = window.setTimeout(updatePanelPlacement, delay);
  }

  function settlePanelPlacement() {
    for (const timer of state.placementSettleTimers) {
      window.clearTimeout(timer);
    }
    state.placementSettleTimers = [100, 350, 800, 1500, 3000, 5000].map((delay) =>
      window.setTimeout(updatePanelPlacement, delay)
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
    host.setAttribute("aria-label", message("panel.aria"));
    const shadow = host.attachShadow({ mode: "open" });
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
          right: 28px;
          bottom: calc(24px + var(--academylens-bottom-offset, 0px));
          z-index: 2147483647;
          width: min(440px, calc(100vw - 48px));
          border: 1px solid rgba(15, 23, 42, 0.14);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12);
          color: #111827;
          font-size: 15px;
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
          gap: 14px;
          min-height: 64px;
          padding: 18px 20px;
          border-bottom: 1px solid rgba(15, 23, 42, 0.1);
        }
        .name {
          font-size: 17px;
          font-weight: 750;
          letter-spacing: 0;
          white-space: nowrap;
        }
        .badge {
          font-size: 13px;
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
        .body {
          display: grid;
          gap: 14px;
          max-height: 410px;
          overflow: hidden;
          padding: 18px 20px 20px;
          opacity: 1;
          transform: translateY(0);
          transition:
            max-height 190ms cubic-bezier(0.2, 0.8, 0.2, 1),
            opacity 140ms ease,
            padding 190ms cubic-bezier(0.2, 0.8, 0.2, 1),
            transform 190ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .panel[data-collapsed="true"] {
          width: min(380px, calc(100vw - 48px));
          box-shadow: 0 6px 18px rgba(15, 23, 42, 0.1);
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
          width: 17px;
          height: 17px;
          margin: 0;
        }
        button, select {
          min-height: 48px;
          border-radius: 10px;
          border: 1px solid rgba(15, 23, 42, 0.16);
          background: #fff;
          color: #111827;
          font: inherit;
          font-size: 15px;
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
          height: 5px;
          min-width: 78px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.08);
        }
        .progress::before {
          display: block;
          width: var(--value);
          height: 100%;
          border-radius: inherit;
          background: #111827;
          content: "";
          transition: width 160ms ease;
        }
        .progress[data-active="true"]::before {
          background: #2563eb;
        }
        @media (max-width: 420px) {
          .panel {
            right: 12px;
            bottom: calc(14px + var(--academylens-bottom-offset, 0px));
            width: calc(100vw - 24px);
          }
          .panel[data-collapsed="true"] {
            width: calc(100vw - 24px);
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
      <section class="panel" data-collapsed="true">
        <div class="top">
          <div class="name">AcademyLens</div>
          <div class="top-actions">
            <div class="badge">${message("badge.unofficial")}</div>
            <button type="button" class="icon-button" data-collapse aria-expanded="true" aria-label="${message("action.collapse")}">-</button>
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
            <div class="progress" data-progress role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
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
    if (candidate.kind === "element") {
      candidate.target.textContent = translated;
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
    if (location.href === state.lastUrl) return;
    state.lastUrl = location.href;
    bumpGeneration();
    restorePage({ bump: false, silent: true });
    setStatus(message("status.ready"));
    settlePanelPlacement();
    if (state.settings.autoTranslate && state.settings.targetLanguage !== "en") {
      scheduleAutoTranslate(900);
    }
  }

  function reconcileMutations(mutations) {
    let sawFrameMutation = false;
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        const nodeRecord = state.nodeRecords.get(mutation.target);
        if (nodeRecord && !isCurrentRecordStillOwned(nodeRecord)) {
          forgetRecord(nodeRecord);
        }
        let parent = mutation.target.parentElement;
        while (parent && parent !== document.body) {
          const elementRecord = state.nodeRecords.get(parent);
          if (elementRecord && !isCurrentRecordStillOwned(elementRecord)) {
            forgetRecord(elementRecord);
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
          }
        }
        for (const node of mutation.addedNodes || []) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.tagName === "IFRAME" || node.querySelector?.("iframe")) {
            sawFrameMutation = true;
          }
        }
      }
    }

    if (sawFrameMutation) {
      window.setTimeout(() => dispatchPendingFrameCommand(), 80);
    }
  }

  function watchSpaNavigation() {
    state.observer = new MutationObserver((mutations) => {
      reconcileMutations(mutations);
      handleRouteChange();
      schedulePanelPlacement();

      if (!state.settings.autoTranslate) return;
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
