(async function initAcademyLens() {
  "use strict";

  const C = globalThis.AcademyLensConstants;
  const Cache = globalThis.AcademyLensCache;
  const BrowserTranslator = globalThis.AcademyLensBrowserTranslator;
  const ContentHelpers = globalThis.AcademyLensContentHelpers;
  const ContentBackgroundClient = globalThis.AcademyLensContentBackgroundClient;
  const Glossary = globalThis.AcademyLensGlossary;
  const ContentLifecycle = globalThis.AcademyLensContentLifecycle;
  const ContentDomObserver = globalThis.AcademyLensContentDomObserver;
  const TranslationController = globalThis.AcademyLensTranslationController;
  const TranslationProvider = globalThis.AcademyLensTranslationProvider;
  const SettingsController = globalThis.AcademyLensSettingsController;
  const DomTranslationRuntime = globalThis.AcademyLensDomTranslationRuntime;
  const FrameMessenger = globalThis.AcademyLensFrameMessenger;
  const PanelView = globalThis.AcademyLensPanelView;
  const Text = globalThis.AcademyLensTextUtils;
  const uiLocale = C && C.getUiLocale ? C.getUiLocale(navigator.language) : "en";
  const BACKGROUND_RESPONSE_TIMEOUT_MS = 12000;
  const BACKGROUND_RESPONSE_MAX_TIMEOUT_MS = 300000;
  const isTopFrame = window.top === window;

  // Remote translation code lives only in the background service worker. The
  // content script deliberately has no direct Google fetch implementation.
  if (
    !C ||
    !ContentHelpers ||
    !ContentBackgroundClient ||
    !ContentLifecycle ||
    !ContentDomObserver ||
    !TranslationController ||
    !TranslationProvider ||
    !SettingsController ||
    !DomTranslationRuntime ||
    !FrameMessenger ||
    !Glossary ||
    !PanelView ||
    !Text ||
    !C.isAcademyUrl(location.href)
  )
    return;

  const H = ContentHelpers.create({ Cache, Text, Node: window.Node });
  const cacheEpochValue = H.cacheEpochValue;
  const chunks = H.chunks;
  const cacheScope = H.cacheScope;
  const cacheHasTranslation = H.cacheHasTranslation;
  const cacheUpdateMeta = H.cacheUpdateMeta;
  const correctionKey = H.correctionKey;
  const correctionFor = H.correctionFor;
  const translationLooksSuspicious = H.translationLooksSuspicious;
  const mergeTranslationResponses = H.mergeTranslationResponses;
  const appendContextText = H.appendContextText;
  const orderedContextTexts = H.orderedContextTexts;
  const mergeDiagnostics = H.mergeDiagnostics;
  const backgroundClient = ContentBackgroundClient.create({
    chrome,
    window,
    constants: C,
    uiLocale,
    createAbortError: abortError
  });
  const settingsController = SettingsController.create({
    chrome,
    constants: C,
    navigator,
    cacheEpochValue
  });

  const state = {
    settings: { ...C.DEFAULT_SETTINGS },
    glossaryIndex: null,
    glossaries: new Map(),
    panel: null,
    shadow: null,
    debounceTimer: 0,
    placementTimer: 0,
    placementFrame: 0,
    placementSettleTimers: [],
    browserTranslatorStatus: "unchecked",
    providerMode: "checking",
    providerDetail: "",
    cacheEpoch: 0,
    selectedCorrection: null,
    corrections: {},
    lastDiagnostics: null,
    collapsed: false,
    collapseUserSet: false,
    pendingDangerAction: "",
    dangerActionTimer: 0
  };
  const translationProvider = TranslationProvider.create({
    constants: C,
    Cache,
    BrowserTranslator,
    backgroundClient,
    getSettings: () => state.settings,
    getCacheEpoch: () => state.cacheEpoch,
    getLocal,
    cacheEpochValue,
    cacheHasTranslation,
    cacheUpdateMeta,
    throwIfAborted,
    persistContentCache,
    setBrowserTranslatorStatus,
    updateProviderModeFromBrowserStatus,
    setProviderMode,
    translationLooksSuspicious,
    message,
    mergeTranslationResponses,
    responseTimeoutMs: BACKGROUND_RESPONSE_TIMEOUT_MS,
    maxResponseTimeoutMs: BACKGROUND_RESPONSE_MAX_TIMEOUT_MS
  });
  let lifecycleController = null;
  let domObserverController = null;
  const translationController = TranslationController.create({
    window,
    AbortController: window.AbortController,
    runTranslation: (options) => performTranslatePage(options),
    isContextCurrent: (targetLanguage, pageUrl) =>
      targetLanguage === state.settings.targetLanguage && pageUrl === location.href
  });
  const domTranslation = DomTranslationRuntime.create({
    document,
    window,
    Text,
    limits: C.LIMITS,
    getTargetLanguage: () => state.settings.targetLanguage,
    getPanelElement: () => state.panel,
    suppressMutationReactions
  });
  const frameMessenger = FrameMessenger.create({
    document,
    window,
    location,
    isTopFrame,
    getTargetLanguage: () => state.settings.targetLanguage,
    setTargetLanguage: (targetLanguage) => {
      state.settings.targetLanguage = targetLanguage;
    },
    getGeneration: () => translationController.generation,
    getRouteVersion: () => lifecycleController?.routeVersion || 0,
    getPageUrl: () => location.href,
    translatePage: (options) => translatePage(options),
    restorePage: (options) => restorePage(options),
    setStatusMessage: (key, params, tone) => setStatus(message(key, params), tone),
    onFrameTranslationResult: ({ applied, failed }) => {
      if (!state.lastDiagnostics) return;
      state.lastDiagnostics.frameApplied = (state.lastDiagnostics.frameApplied || 0) + (applied || 0);
      state.lastDiagnostics.frameFailed = (state.lastDiagnostics.frameFailed || 0) + (failed || 0);
      updateDiagnosticsPanel();
    }
  });
  lifecycleController = ContentLifecycle.create({
    window,
    history,
    location,
    onRouteChange: handleRouteTransition,
    onResize: () => schedulePanelPlacement(),
    onScroll: () => schedulePanelPlacement(120),
    onPageHide: teardownContent
  });
  domObserverController = ContentDomObserver.create({
    document,
    window,
    MutationObserver: window.MutationObserver,
    mutationElement,
    shouldIgnore: isPanelMutation,
    inspectNode: (node) => ({
      sawFrameMutation: node.tagName === "IFRAME" || Boolean(node.querySelector?.("iframe")),
      sawTranslatableMutation: elementMayContainTranslatableText(node)
    }),
    reconcileMutations,
    checkRouteChange: () => lifecycleController.checkRouteChange(),
    dispatchPendingFrameCommand: () => frameMessenger.dispatchPendingCommand(),
    onSignals: handleMutationSignals
  });

  function abortError() {
    const error = new Error(message("status.failed"));
    error.name = "AbortError";
    return error;
  }

  function throwIfAborted(signal) {
    if (signal && signal.aborted) throw abortError();
  }

  function currentAbortSignal(generation) {
    return translationController.currentAbortSignal(generation);
  }

  function getLocal(keys) {
    return chrome.storage.local.get(keys);
  }

  function setStatus(message, tone, options = {}) {
    if (!state.shadow) return;
    if (state.pendingDangerAction && !options.allowDuringDangerAction) return;
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
    return translationController.bumpGeneration();
  }

  function isCurrentGeneration(generation, targetLanguage, pageUrl) {
    return translationController.isCurrent(generation, targetLanguage, pageUrl);
  }

  function suppressMutationReactions(durationMs = 250) {
    domObserverController?.suppress(durationMs);
  }

  async function raceCurrentGeneration(promise, generation, targetLanguage, pageUrl) {
    return translationController.raceCurrent(promise, generation, targetLanguage, pageUrl);
  }

  function setBusy(isBusy, generation) {
    if (generation && generation !== translationController.generation) return;
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
        nativeUnavailable: "provider.nativeUnavailable",
        background: "provider.background",
        local: "provider.local",
        ollama: "provider.ollama"
      }[mode] || "provider.checking"
    );
  }

  function setProviderMode(mode, detail = "") {
    state.providerMode = mode || "checking";
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
    setProviderMode("nativeUnavailable");
  }

  async function refreshBrowserTranslatorStatus() {
    const engine = C.normalizeTranslationEngine(state.settings.translationEngine);
    if (C.engineUsesOllama(engine)) {
      setBrowserTranslatorStatus("local");
      setProviderMode("ollama", C.normalizeOllamaModel(state.settings.ollamaModel));
      return;
    }
    if (C.engineAllowsRemote(engine)) {
      setBrowserTranslatorStatus("not-selected");
      setProviderMode("background");
      return;
    }
    if (!isTopFrame || !BrowserTranslator || typeof BrowserTranslator.availability !== "function") {
      setBrowserTranslatorStatus("unsupported");
      setProviderMode("nativeUnavailable");
      return;
    }

    const targetLanguage = state.settings.targetLanguage;
    if (!targetLanguage || targetLanguage === "en") {
      setBrowserTranslatorStatus("unavailable");
      setProviderMode("nativeUnavailable");
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

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function persistContentCacheLocally(cacheUpdates, expectedEpoch = state.cacheEpoch) {
    if (!Cache || !Object.keys(cacheUpdates).length) return false;
    try {
      const stored = await getLocal([C.STORAGE_KEYS.CACHE, C.STORAGE_KEYS.CACHE_EPOCH]);
      const currentEpoch = cacheEpochValue(stored[C.STORAGE_KEYS.CACHE_EPOCH]);
      if (cacheEpochValue(expectedEpoch) !== currentEpoch) return true;
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

  async function persistContentCache(cacheUpdates, expectedEpoch = state.cacheEpoch, signal) {
    if (!Cache || !Object.keys(cacheUpdates).length) return false;
    try {
      const response = await backgroundClient.send(
        {
          type: C.MESSAGE_TYPES.PERSIST_CACHE_UPDATES,
          cacheUpdates,
          expectedCacheEpoch: expectedEpoch
        },
        BACKGROUND_RESPONSE_TIMEOUT_MS,
        signal
      );
      return Boolean(response && response.persisted);
    } catch (error) {
      if (error && error.name === "AbortError") return false;
      console.warn("[AcademyLens] background cache persistence unavailable; trying local persistence", error);
      return persistContentCacheLocally(cacheUpdates, expectedEpoch);
    }
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

  async function clearTranslationCacheLocally() {
    const stored = await getLocal([C.STORAGE_KEYS.CACHE_EPOCH]);
    const nextEpoch = cacheEpochValue(stored[C.STORAGE_KEYS.CACHE_EPOCH]) + 1;
    state.cacheEpoch = nextEpoch;
    await chrome.storage.local.set({
      [C.STORAGE_KEYS.CACHE]: {},
      [C.STORAGE_KEYS.CACHE_EPOCH]: nextEpoch
    });
    state.lastDiagnostics = null;
    updateDiagnosticsPanel();
  }

  async function clearTranslationCache() {
    try {
      const response = await backgroundClient.send(
        { type: C.MESSAGE_TYPES.CLEAR_CACHE },
        BACKGROUND_RESPONSE_TIMEOUT_MS
      );
      if (!response || !response.cleared) {
        throw new Error((response && response.error) || "cache clear failed");
      }
      state.cacheEpoch = cacheEpochValue(response.cacheEpoch);
      state.lastDiagnostics = null;
      updateDiagnosticsPanel();
    } catch (error) {
      console.warn("[AcademyLens] background cache clear unavailable; trying local clear", error);
      await clearTranslationCacheLocally();
    }
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
    const entries = H.correctionEntries(state.corrections);
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

  function restoreDangerButtons() {
    if (!state.shadow) return;
    const deleteButton = state.shadow.querySelector("[data-delete-correction]");
    const clearCorrectionsButton = state.shadow.querySelector("[data-clear-corrections]");
    const clearCacheButton = state.shadow.querySelector("[data-clear-cache]");
    if (deleteButton) deleteButton.textContent = message("action.deleteCorrection");
    if (clearCorrectionsButton) clearCorrectionsButton.textContent = message("action.clearCorrections");
    if (clearCacheButton) clearCacheButton.textContent = message("action.clearCache");
  }

  function resetDangerConfirmation() {
    window.clearTimeout(state.dangerActionTimer);
    state.dangerActionTimer = 0;
    state.pendingDangerAction = "";
    restoreDangerButtons();
  }

  function confirmDangerAction(action, button, confirmLabelKey) {
    if (state.pendingDangerAction === action) {
      resetDangerConfirmation();
      return true;
    }

    resetDangerConfirmation();
    state.pendingDangerAction = action;
    if (button && confirmLabelKey) button.textContent = message(confirmLabelKey);
    setStatus(message("status.confirmLocalDelete"), undefined, { allowDuringDangerAction: true });
    state.dangerActionTimer = window.setTimeout(resetDangerConfirmation, 5000);
    return false;
  }

  async function deleteSelectedCorrection(event) {
    if (!state.shadow) return;
    const select = state.shadow.querySelector("[data-correction-list]");
    if (!select || !select.value) return;
    if (!confirmDangerAction("deleteCorrection", event.currentTarget, "action.confirmDeleteCorrection")) return;
    const deleted = await deleteCorrection(select.value);
    if (deleted) {
      clearSelectedCorrection();
      await refreshCorrectionRecords();
      setStatus(message("status.correctionDeleted"), "ok");
    }
  }

  async function clearAllCorrections(event) {
    if (!confirmDangerAction("clearCorrections", event.currentTarget, "action.confirmClearCorrections")) return;
    await clearCorrections();
    clearSelectedCorrection();
    await refreshCorrectionRecords();
    setStatus(message("status.correctionsCleared"), "ok");
  }

  async function clearCacheFromPanel(event) {
    if (!confirmDangerAction("clearCache", event.currentTarget, "action.confirmClearCache")) return;
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
      provider: diagnostics.provider || state.providerMode || "checking",
      hits: diagnostics.cacheHits || 0,
      misses: diagnostics.cacheMisses || 0,
      corrections: diagnostics.corrections || 0,
      groups: diagnostics.contextGroups || 0,
      frameApplied: diagnostics.frameApplied || 0,
      frameFailed: diagnostics.frameFailed || 0
    });
  }

  function message(key, params) {
    return C.getMessage(key, uiLocale, params);
  }

  function languageLabel(code) {
    return C.getLanguageLabel(code, uiLocale);
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

  async function loadCacheEpoch() {
    try {
      const stored = await getLocal([C.STORAGE_KEYS.CACHE_EPOCH]);
      state.cacheEpoch = cacheEpochValue(stored[C.STORAGE_KEYS.CACHE_EPOCH]);
    } catch {
      state.cacheEpoch = 0;
    }
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
    shadow.innerHTML = PanelView.renderPanel({
      browserTranslatorStatus: state.browserTranslatorStatus,
      iconUrl,
      message,
      providerMessageKey,
      providerMode: state.providerMode,
      version: extensionVersion()
    });

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

    shadow.querySelector("[data-translate]").addEventListener("click", () => {
      resetDangerConfirmation();
      translatePage({ reason: "manual" });
    });
    shadow.querySelector("[data-restore]").addEventListener("click", () => {
      resetDangerConfirmation();
      restorePage();
    });
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

  async function refreshCorrectionRecords() {
    let restored = 0;
    for (const record of domTranslation.currentRecords()) {
      if (record.translationSource !== "correction") continue;
      if (correctionFor(state.corrections, state.settings.targetLanguage, record.normalized)) continue;
      if (domTranslation.restoreRecordOriginal(record)) restored += 1;
      domTranslation.forgetRecord(record);
    }
    if (restored > 0 && state.settings.targetLanguage !== "en") {
      await translatePage({ reason: "correction-refresh" });
    }
    return restored;
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

  async function saveSelectedCorrection() {
    if (!state.selectedCorrection || !state.shadow) return;
    const input = state.shadow.querySelector("[data-correction-input]");
    const translated = Text.normalizeWhitespace(input ? input.value : "");
    if (!translated) return;

    const record = state.selectedCorrection;
    if (!domTranslation.applyCorrectionToRecord(record, translated)) {
      clearSelectedCorrection();
      return;
    }

    const persisted = await persistCorrection(record, translated);
    setProviderMode("local");
    setStatus(
      persisted
        ? message("status.translated", { count: domTranslation.currentRecords().length })
        : message("status.translatedPartial", { count: domTranslation.currentRecords().length, failed: 1 }),
      persisted ? "ok" : "error"
    );
    clearSelectedCorrection();
  }

  function handleCorrectionClick(event) {
    const element = mutationElement(event.target);
    const record = domTranslation.recordForClickedElement(element);
    if (record) {
      selectCorrectionRecord(record);
    }
  }

  function diagnosticsFromResponse(response, requestedCount) {
    return H.diagnosticsFromResponse(response, requestedCount, state.providerMode);
  }

  async function translateCandidatePass({ generation, targetLanguage, pageUrl, glossary, childFrameCount = 0 }) {
    const signal = currentAbortSignal(generation);
    throwIfAborted(signal);
    const candidates = domTranslation.collectCandidates();
    const reachedLimit = candidates.length >= (C.LIMITS.maxTextNodesPerPass || 120);
    if (candidates.length === 0) {
      return { applied: 0, failed: 0, childFrameCount, hadCandidates: false, reachedLimit: false };
    }

    const corrections = await loadCorrections();
    const baseScope = cacheScope("runtime", glossary, {});
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
      frameApplied: 0,
      frameFailed: 0,
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
      const inlinePrepared = domTranslation.prepareInlinePlaceholders(candidate, prepared);
      preparedByCandidate.set(candidate, inlinePrepared);
      const direct = domTranslation.directGlossaryTranslation(inlinePrepared);
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
      const directSource = preparedByCandidate.has(candidate) ? "glossary" : "correction";
      if (
        directTranslation &&
        domTranslation.applyCandidateTranslation(candidate, directTranslation, null, directSource)
      ) {
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
          const chunkResponse = await raceCurrentGeneration(
            translationProvider.sendTranslationBatch(
              {
                type: C.MESSAGE_TYPES.TRANSLATE_BATCH,
                targetLanguage,
                texts: textChunks[index],
                cacheScope: baseScope,
                cacheEpoch: state.cacheEpoch,
                operationId: `${frameMessenger.getFrameSessionToken()}:${generation}`
              },
              90000,
              signal
            ),
            generation,
            targetLanguage,
            pageUrl
          );
          if (!chunkResponse) return;
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
      if (domTranslation.applyCandidateTranslation(candidate, translated, prepared.inlinePlaceholders, "provider")) {
        applied += 1;
      }
    }

    const failed = response.errors ? Object.keys(response.errors).length : 0;
    return { applied, failed, childFrameCount, hadCandidates: true, reachedLimit, diagnostics };
  }

  function cancelQueuedTranslation() {
    translationController.cancelQueued();
  }

  function translatePage(options = {}) {
    return translationController.enqueue(options, options.delay || 0);
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
      ? frameMessenger.postToChildFrames("translate", { targetLanguage })
      : { payload: null, sent: 0 };
    const childFrameCount = frameDispatch.sent;
    frameMessenger.startAggregate(frameDispatch.payload, childFrameCount, "translate");
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
      frameApplied: 0,
      frameFailed: 0,
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
      capped = domTranslation.collectCandidates().length > 0;
    }

    if (failed > 0) {
      setProgress(0);
      state.lastDiagnostics = diagnostics;
      updateDiagnosticsPanel();
      frameMessenger.updateAggregatePage(frameDispatch.payload && frameDispatch.payload.messageId, { applied, failed });
      schedulePanelPlacement();
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
    frameMessenger.updateAggregatePage(frameDispatch.payload && frameDispatch.payload.messageId, { applied, failed });
    schedulePanelPlacement();
    if (capped) {
      setStatus(message("status.translatedCapped", { count: applied }), "ok");
    } else if (childFrameCount > 0) {
      const aggregateStatusSet = frameMessenger.setAggregateStatus(frameDispatch.payload.messageId);
      if (!aggregateStatusSet) {
        setStatus(
          applied > 0 ? message("status.translated", { count: applied }) : message("status.frameDispatch"),
          "ok"
        );
      }
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
    frameMessenger.clearAggregates();
    if (isTopFrame && options.broadcastFrames !== false) {
      frameMessenger.postToChildFrames("restore");
    }
    const restored = domTranslation.restoreAllRecords();
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

  function handleRouteTransition() {
    frameMessenger.clearAggregates();
    bumpGeneration();
    restorePage({ bump: false, silent: true });
    setStatus(message("status.ready"));
    settlePanelPlacement();
    if (state.settings.autoTranslate && state.settings.targetLanguage !== "en") {
      scheduleAutoTranslate(900);
    }
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

  function reconcileMutations(mutations, queueMutationScan) {
    let sawFrameMutation = false;
    let sawTranslatableMutation = false;
    let needsDeferredScan = false;
    for (const mutation of mutations) {
      if (isPanelMutation(mutation.target)) continue;

      if (mutation.type === "characterData") {
        const nodeRecord = domTranslation.recordForTarget(mutation.target);
        if (nodeRecord && !domTranslation.isCurrentRecordStillOwned(nodeRecord)) {
          domTranslation.forgetRecord(nodeRecord);
          sawTranslatableMutation = true;
        } else if (!nodeRecord && textNodeMayNeedTranslation(mutation.target)) {
          sawTranslatableMutation = true;
        }
        let parent = mutation.target.parentElement;
        while (parent && parent !== document.body) {
          const elementRecord = domTranslation.recordForTarget(parent);
          if (elementRecord && !domTranslation.isCurrentRecordStillOwned(elementRecord)) {
            domTranslation.forgetRecord(elementRecord);
            sawTranslatableMutation = true;
            break;
          }
          parent = parent.parentElement;
        }
      }

      if (mutation.type === "childList") {
        if (mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE) {
          const elementRecord = domTranslation.recordForTarget(mutation.target);
          if (elementRecord && !domTranslation.isCurrentRecordStillOwned(elementRecord)) {
            domTranslation.forgetRecord(elementRecord);
            sawTranslatableMutation = true;
          }
        }
        for (const node of mutation.addedNodes || []) {
          if (isPanelMutation(node)) continue;
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.tagName === "IFRAME") {
            sawFrameMutation = true;
          }
          queueMutationScan(node);
          needsDeferredScan = true;
        }
      }
    }

    return { sawFrameMutation, sawTranslatableMutation, needsDeferredScan };
  }

  function handleMutationSignals(signal = {}, routeChanged = false) {
    if (signal.sawFrameMutation || signal.sawTranslatableMutation || signal.needsDeferredScan || routeChanged) {
      schedulePanelPlacement();
    }
    if (!state.settings.autoTranslate || routeChanged || !signal.sawTranslatableMutation) return;
    scheduleAutoTranslate(800);
  }

  async function applySettings(nextSettings, options = {}) {
    const previousLanguage = state.settings.targetLanguage;
    const previousAutoTranslate = state.settings.autoTranslate;
    const previousNativeDownloads = state.settings.enableBrowserTranslatorDownloads;
    const previousEngine = state.settings.translationEngine;
    const previousOllamaModel = state.settings.ollamaModel;
    state.settings = {
      ...C.DEFAULT_SETTINGS,
      ...state.settings,
      ...(nextSettings || {})
    };
    state.settings.translationEngine = C.normalizeTranslationEngine(state.settings.translationEngine);
    state.settings.ollamaModel = C.normalizeOllamaModel(state.settings.ollamaModel);
    const providerChanged =
      previousEngine !== state.settings.translationEngine || previousOllamaModel !== state.settings.ollamaModel;

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
    } else if (providerChanged) {
      bumpGeneration();
      restorePage({ bump: false, silent: true });
    }

    if (C.engineUsesOllama(state.settings.translationEngine)) {
      setProviderMode("ollama", state.settings.ollamaModel);
    } else if (previousNativeDownloads !== state.settings.enableBrowserTranslatorDownloads || providerChanged) {
      refreshBrowserTranslatorStatus();
    }

    if (
      !options.skipAutoTranslate &&
      state.settings.autoTranslate &&
      state.settings.targetLanguage !== "en" &&
      (previousLanguage !== state.settings.targetLanguage ||
        previousAutoTranslate !== state.settings.autoTranslate ||
        providerChanged)
    ) {
      scheduleAutoTranslate(250);
    }
  }

  function teardownContent() {
    settingsController.stop();
    translationController.stop();
    domObserverController.stop();
    frameMessenger.clearAggregates();
    window.clearTimeout(state.debounceTimer);
    window.clearTimeout(state.placementTimer);
    window.clearTimeout(state.dangerActionTimer);
    if (state.placementFrame) {
      window.cancelAnimationFrame(state.placementFrame);
      state.placementFrame = 0;
    }
    for (const timer of state.placementSettleTimers) {
      window.clearTimeout(timer);
    }
  }

  try {
    state.settings = await settingsController.load();
    await loadCacheEpoch();
    await loadGlossaryIndex();
    await loadCorrections();
    await ensureGlossary(state.settings.targetLanguage);
    if (isTopFrame) {
      createPanel();
    }
    frameMessenger.watchMessages();
    lifecycleController.start();
    domObserverController.start();
    settingsController.start({
      onCacheEpoch: (value) => {
        state.cacheEpoch = value;
      },
      onSettings: (settings) => applySettings(settings)
    });
    document.addEventListener("click", handleCorrectionClick, true);
    frameMessenger.postReady();
    if (state.settings.autoTranslate) {
      scheduleAutoTranslate(600);
    }
  } catch (error) {
    console.warn("[AcademyLens]", error);
  }
})();
