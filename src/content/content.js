(async function initAcademyLens() {
  "use strict";

  const C = globalThis.AcademyLensConstants;
  const Glossary = globalThis.AcademyLensGlossary;
  const Text = globalThis.AcademyLensTextUtils;
  const uiLocale = C && C.getUiLocale ? C.getUiLocale(navigator.language) : "en";

  if (!C || !Glossary || !Text || !C.isAcademyUrl(location.href)) return;

  const state = {
    settings: { ...C.DEFAULT_SETTINGS },
    glossary: null,
    panel: null,
    shadow: null,
    replacements: [],
    nodeRecords: new WeakMap(),
    lastUrl: location.href,
    generation: 0,
    observer: null,
    debounceTimer: 0
  };

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
    note.textContent = C.getLanguageSupportMessage(state.settings.targetLanguage, uiLocale);
    note.dataset.glossary = String(C.isGlossaryBackedLanguage(state.settings.targetLanguage));
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

  async function loadSettings() {
    const stored = await getLocal([C.STORAGE_KEYS.SETTINGS]);
    state.settings = {
      ...C.DEFAULT_SETTINGS,
      ...(stored[C.STORAGE_KEYS.SETTINGS] || {})
    };
  }

  async function loadGlossary() {
    const response = await fetch(chrome.runtime.getURL("src/data/glossary.ko.json"));
    if (!response.ok) throw new Error("Failed to load glossary");
    state.glossary = Glossary.normalizeGlossary(await response.json());
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
          right: 18px;
          bottom: 18px;
          z-index: 2147483647;
          width: 278px;
          border: 1px solid rgba(15, 23, 42, 0.16);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.16);
          color: #111827;
          overflow: hidden;
          pointer-events: auto;
        }
        .top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(15, 23, 42, 0.1);
        }
        .name {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0;
          white-space: nowrap;
        }
        .badge {
          font-size: 10px;
          color: #475569;
          white-space: nowrap;
        }
        .body {
          display: grid;
          gap: 8px;
          padding: 10px 12px 12px;
        }
        .field {
          display: grid;
          gap: 5px;
        }
        .note {
          color: #64748b;
          font-size: 10.5px;
          line-height: 1.35;
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
          font-size: 11px;
          line-height: 1;
        }
        .toggle input {
          width: 14px;
          height: 14px;
          margin: 0;
        }
        button, select {
          min-height: 34px;
          border-radius: 6px;
          border: 1px solid rgba(15, 23, 42, 0.16);
          background: #fff;
          color: #111827;
          font: inherit;
          font-size: 12px;
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
          min-height: 16px;
          color: #475569;
          font-size: 11px;
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
          height: 3px;
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
      </style>
      <section class="panel">
        <div class="top">
          <div class="name">AcademyLens</div>
          <div class="badge">${message("badge.unofficial")}</div>
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

    document.documentElement.append(host);
    state.panel = host;
    state.shadow = shadow;
    updateLanguageSupport();
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

  async function translatePage() {
    const generation = bumpGeneration();
    const targetLanguage = state.settings.targetLanguage;
    const pageUrl = location.href;

    if (targetLanguage === "en") {
      restorePage({ bump: false });
      return;
    }

    if (!state.glossary) {
      setStatus(message("status.glossaryLoading"), "error");
      return;
    }

    const candidates = collectCandidates();
    if (candidates.length === 0) {
      setStatus(message("status.noNewText"), "ok");
      return;
    }

    const unique = new Map();
    const preparedByOriginal = new Map();
    for (const candidate of candidates) {
      if (unique.has(candidate.normalized)) continue;
      const prepared = Glossary.prepareForTranslation(candidate.normalized, state.glossary, targetLanguage);
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
      return;
    } finally {
      setBusy(false, generation);
    }

    if (!isCurrentGeneration(generation, targetLanguage, pageUrl)) return;
    setProgress(65);

    if (!response || !response.ok) {
      setProgress(0);
      setStatus(response && response.error ? response.error : message("status.failed"), "error");
      return;
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
  }

  function restorePage(options = {}) {
    if (options.bump !== false) bumpGeneration();
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
    if (!options.silent) {
      setStatus(message("status.restored", { count: restored }), "ok");
    }
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
    if (state.settings.autoTranslate && state.settings.targetLanguage !== "en") {
      scheduleAutoTranslate(900);
    }
  }

  function watchSpaNavigation() {
    state.observer = new MutationObserver(() => {
      handleRouteChange();

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
    window.addEventListener("pagehide", () => {
      state.observer?.disconnect();
      window.clearTimeout(state.debounceTimer);
    });
  }

  try {
    await loadSettings();
    await loadGlossary();
    createPanel();
    watchHistoryNavigation();
    watchSpaNavigation();
    if (state.settings.autoTranslate) {
      scheduleAutoTranslate(600);
    }
  } catch (error) {
    console.warn("[AcademyLens]", error);
  }
})();
