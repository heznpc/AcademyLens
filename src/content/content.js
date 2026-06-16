(async function initAcademyLens() {
  "use strict";

  const C = globalThis.AcademyLensConstants;
  const Glossary = globalThis.AcademyLensGlossary;
  const Text = globalThis.AcademyLensTextUtils;
  const uiLocale = C && C.getUiLocale ? C.getUiLocale(navigator.language) : "en";
  const FRAME_MESSAGE_SOURCE = "AcademyLens";
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

  function message(key, params) {
    return C.getMessage(key, uiLocale, params);
  }

  function languageLabel(code) {
    return C.getLanguageLabel(code, uiLocale);
  }

  function postToChildFrames(action, extra = {}) {
    let sent = 0;
    const payload = {
      source: FRAME_MESSAGE_SOURCE,
      action,
      messageId: extra.messageId || frameMessageId(),
      targetLanguage: extra.targetLanguage || state.settings.targetLanguage
    };

    for (const frame of document.querySelectorAll("iframe")) {
      if (!frame.contentWindow) continue;
      try {
        frame.contentWindow.postMessage(payload, location.origin);
        sent += 1;
      } catch {
        // Cross-origin or not-yet-ready course frames are skipped; later user actions can retry.
      }
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

  async function handleFrameCommand(data) {
    if (isTopFrame || !data || data.source !== FRAME_MESSAGE_SOURCE) return;
    if (data.targetLanguage) {
      state.settings.targetLanguage = data.targetLanguage;
    }

    if (data.action === "translate") {
      postToChildFrames("translate", {
        messageId: data.messageId,
        targetLanguage: state.settings.targetLanguage
      });
      const result = await translatePage({ broadcastFrames: false });
      postFrameResult("translate", result);
    }

    if (data.action === "restore") {
      postToChildFrames("restore", {
        messageId: data.messageId,
        targetLanguage: state.settings.targetLanguage
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
      handleFrameResult(data);
      handleFrameCommand(data);
    });
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
          right: 22px;
          bottom: calc(18px + var(--academylens-bottom-offset, 0px));
          z-index: 2147483647;
          width: min(342px, calc(100vw - 36px));
          border: 1px solid rgba(15, 23, 42, 0.16);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.16);
          color: #111827;
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
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(15, 23, 42, 0.1);
        }
        .name {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0;
          white-space: nowrap;
        }
        .badge {
          font-size: 11px;
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
          width: 24px;
          min-height: 24px;
          place-items: center;
          border: 1px solid rgba(15, 23, 42, 0.12);
          border-radius: 6px;
          background: rgba(248, 250, 252, 0.9);
          color: #334155;
          font-size: 15px;
          line-height: 1;
        }
        .body {
          display: grid;
          gap: 10px;
          max-height: 260px;
          overflow: hidden;
          padding: 12px 14px 14px;
          opacity: 1;
          transform: translateY(0);
          transition:
            max-height 190ms cubic-bezier(0.2, 0.8, 0.2, 1),
            opacity 140ms ease,
            padding 190ms cubic-bezier(0.2, 0.8, 0.2, 1),
            transform 190ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .panel[data-collapsed="true"] {
          width: 232px;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.13);
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
          gap: 6px;
        }
        .note {
          color: #64748b;
          font-size: 11.5px;
          line-height: 1.4;
        }
        .note[data-glossary="true"] {
          color: #047857;
        }
        .row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .settings {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .toggle {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #475569;
          font-size: 12px;
          line-height: 1;
        }
        .toggle input {
          width: 15px;
          height: 15px;
          margin: 0;
        }
        button, select {
          min-height: 38px;
          border-radius: 6px;
          border: 1px solid rgba(15, 23, 42, 0.16);
          background: #fff;
          color: #111827;
          font: inherit;
          font-size: 13px;
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
          min-height: 18px;
          color: #475569;
          font-size: 12px;
          line-height: 1.45;
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
          height: 4px;
          min-width: 54px;
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
            right: 14px;
            width: min(330px, calc(100vw - 28px));
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
      bumpGeneration();
      restorePage({ bump: false, silent: true });
      state.settings.targetLanguage = language.value;
      await chrome.storage.local.set({ [C.STORAGE_KEYS.SETTINGS]: state.settings });
      try {
        await ensureGlossary(state.settings.targetLanguage);
      } catch (error) {
        setStatus(error.message || message("status.failed"), "error");
        updateLanguageSupport();
        return;
      }
      updateLanguageSupport();
      setStatus(message("status.targetLanguage", { language: languageLabel(language.value) }));
      if (state.settings.autoTranslate && state.settings.targetLanguage !== "en") {
        scheduleAutoTranslate(250);
      }
    });
    autoTranslate.addEventListener("change", async () => {
      state.settings.autoTranslate = autoTranslate.checked;
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
    return state.replacements.filter((record) => record.node && record.node.isConnected);
  }

  function collectCandidates() {
    const nodes = Text.collectTranslatableTextNodes(document.body, {
      targetLanguage: state.settings.targetLanguage,
      maxTextLength: C.LIMITS.maxTextLength,
      maxNodes: C.LIMITS.maxTextNodesPerPass
    });

    return nodes
      .filter((node) => !state.nodeRecords.has(node))
      .map((node) => ({
        node,
        original: node.textContent,
        normalized: Text.normalizeWhitespace(node.textContent)
      }))
      .filter((item) => item.normalized);
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

    const childFrameCount = shouldBroadcastFrames ? postToChildFrames("translate", { targetLanguage }) : 0;
    const candidates = collectCandidates();
    if (candidates.length === 0) {
      setStatus(childFrameCount > 0 ? message("status.frameDispatch") : message("status.noNewText"), "ok");
      return { applied: 0, failed: 0, childFrameCount };
    }

    const unique = new Map();
    const preparedByOriginal = new Map();
    for (const candidate of candidates) {
      if (unique.has(candidate.normalized)) continue;
      const prepared = Glossary.prepareForTranslation(candidate.normalized, glossary, targetLanguage);
      unique.set(candidate.normalized, prepared.text);
      preparedByOriginal.set(candidate.normalized, prepared);
    }

    setStatus(message("status.translating", { count: unique.size }));
    setProgress(15);
    setBusy(true, generation);
    let response;
    try {
      response = await sendMessage({
        type: C.MESSAGE_TYPES.TRANSLATE_BATCH,
        targetLanguage,
        texts: [...unique.values()]
      });
    } catch (error) {
      if (isCurrentGeneration(generation, targetLanguage, pageUrl)) {
        setProgress(0);
        setStatus(error.message || message("status.failed"), "error");
      }
      return { applied: 0, failed: 1, childFrameCount };
    } finally {
      setBusy(false, generation);
    }

    if (!isCurrentGeneration(generation, targetLanguage, pageUrl)) return;
    setProgress(65);

    if (!response || !response.ok) {
      setProgress(0);
      setStatus(response && response.error ? response.error : message("status.failed"), "error");
      return { applied: 0, failed: 1, childFrameCount };
    }

    let applied = 0;
    for (const candidate of candidates) {
      if (!isCurrentGeneration(generation, targetLanguage, pageUrl)) return;
      if (!candidate.node || !candidate.node.isConnected) continue;

      const prepared = preparedByOriginal.get(candidate.normalized);
      const rawTranslation = response.translated[prepared.text];
      if (!rawTranslation) continue;

      const translated = Glossary.restoreProtectedTerms(rawTranslation, prepared.placeholders);
      if (!translated || translated === candidate.normalized) continue;

      const record = {
        node: candidate.node,
        original: candidate.original,
        normalized: candidate.normalized,
        translated,
        hash: Text.stableHash(candidate.normalized)
      };
      state.nodeRecords.set(candidate.node, record);
      state.replacements.push(record);
      Text.applyTranslatedText(candidate.node, translated);
      applied += 1;
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
      if (!record.node || !record.node.isConnected) continue;
      record.node.textContent = record.original;
      state.nodeRecords.delete(record.node);
      restored += 1;
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

  function watchSpaNavigation() {
    state.observer = new MutationObserver(() => {
      handleRouteChange();
      schedulePanelPlacement();

      if (!state.settings.autoTranslate) return;
      scheduleAutoTranslate(800);
    });

    state.observer.observe(document.body, {
      childList: true,
      subtree: true
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
    if (state.settings.autoTranslate) {
      scheduleAutoTranslate(600);
    }
  } catch (error) {
    console.warn("[AcademyLens]", error);
  }
})();
