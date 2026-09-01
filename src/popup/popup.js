(async function initPopup() {
  "use strict";

  const C = globalThis.AcademyLensConstants;
  const uiLocale = C.getUiLocale(navigator.language);
  const language = document.getElementById("targetLanguage");
  const engine = document.getElementById("translationEngine");
  const engineNote = document.getElementById("engineNote");
  const ollamaModelField = document.getElementById("ollamaModelField");
  const ollamaModel = document.getElementById("ollamaModel");
  const ollamaHealth = document.getElementById("ollamaHealth");
  const ollamaStatus = document.getElementById("ollamaStatus");
  const ollamaRetry = document.getElementById("ollamaRetry");
  const autoTranslate = document.getElementById("autoTranslate");
  const nativeDownloads = document.getElementById("nativeDownloads");
  const languageSupport = document.getElementById("languageSupport");
  let glossaryIndex = null;
  let engineChangeGeneration = 0;
  let ollamaHealthGeneration = 0;
  let ollamaModelGeneration = 0;
  let storageWriteChain = Promise.resolve();

  document.documentElement.lang = uiLocale;
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = C.getMessage(node.dataset.i18n, uiLocale);
  }

  const languagePlaceholder = document.createElement("option");
  languagePlaceholder.value = "";
  languagePlaceholder.textContent = C.getMessage("field.targetLanguage", uiLocale);
  language.append(languagePlaceholder);

  for (const item of C.SUPPORTED_LANGUAGES) {
    const option = document.createElement("option");
    option.value = item.code;
    option.lang = item.lang || item.code;
    option.textContent = C.getLanguageLabel(item.code, uiLocale);
    language.append(option);
  }

  for (const value of C.TRANSLATION_ENGINE_VALUES) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = C.getMessage(`engine.${value}`, uiLocale);
    engine.append(option);
  }

  for (const model of C.OLLAMA_MODELS) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    ollamaModel.append(option);
  }

  try {
    const response = await fetch(chrome.runtime.getURL("src/data/glossary.index.json"));
    if (response.ok) glossaryIndex = await response.json();
  } catch {
    glossaryIndex = null;
  }

  const stored = await chrome.storage.local.get([C.STORAGE_KEYS.SETTINGS]);
  const storedSettings = stored[C.STORAGE_KEYS.SETTINGS] || {};
  const settings = {
    ...C.DEFAULT_SETTINGS,
    ...storedSettings
  };

  // First run: suggest a target language from the browser instead of assuming one.
  if (!settings.targetLanguage) {
    settings.targetLanguage = C.resolveDefaultTargetLanguage(
      Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language]
    );
  }
  settings.translationEngine = C.normalizeTranslationEngine(settings.translationEngine);
  settings.ollamaModel = C.normalizeOllamaModel(settings.ollamaModel);

  language.value = settings.targetLanguage;
  engine.value = settings.translationEngine;
  ollamaModel.value = settings.ollamaModel;
  autoTranslate.checked = Boolean(settings.autoTranslate);
  nativeDownloads.checked = Boolean(settings.enableBrowserTranslatorDownloads);
  updateLanguageSupport();
  setEngineNote(`engine.note${engineNoteSuffix(settings.translationEngine)}`);
  updateOllamaModelVisibility();
  if (C.engineUsesOllama(settings.translationEngine)) await checkOllamaStatus();

  function engineNoteSuffix(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function setEngineNote(key) {
    engineNote.textContent = C.getMessage(key, uiLocale);
  }

  function updateOllamaModelVisibility() {
    const visible = C.engineUsesOllama(engine.value);
    ollamaModelField.hidden = !visible;
    ollamaHealth.hidden = !visible;
  }

  async function checkOllamaStatus() {
    const generation = ++ollamaHealthGeneration;
    const model = C.normalizeOllamaModel(ollamaModel.value);
    if (!C.engineUsesOllama(engine.value)) return;
    ollamaStatus.textContent = C.getMessage("ollama.checking", uiLocale);
    ollamaRetry.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({
        type: C.MESSAGE_TYPES.CHECK_OLLAMA,
        ollamaModel: model
      });
      if (
        generation !== ollamaHealthGeneration ||
        !C.engineUsesOllama(engine.value) ||
        C.normalizeOllamaModel(ollamaModel.value) !== model
      ) {
        return;
      }
      if (response && response.status === "ready") {
        ollamaStatus.textContent = C.getMessage("ollama.ready", uiLocale, { model: response.model });
      } else if (response && response.status === "model-missing") {
        ollamaStatus.textContent = C.getMessage("ollama.modelMissing", uiLocale, { model });
      } else {
        ollamaStatus.textContent = C.getMessage("ollama.offline", uiLocale);
      }
    } catch {
      if (
        generation === ollamaHealthGeneration &&
        C.engineUsesOllama(engine.value) &&
        C.normalizeOllamaModel(ollamaModel.value) === model
      ) {
        ollamaStatus.textContent = C.getMessage("ollama.offline", uiLocale);
      }
    } finally {
      if (generation === ollamaHealthGeneration) ollamaRetry.disabled = false;
    }
  }

  function updateLanguageSupport() {
    languageSupport.textContent = language.value
      ? C.getLanguageSupportMessage(language.value, uiLocale, glossaryIndex)
      : "";
    languageSupport.dataset.glossary = String(
      Boolean(language.value) && C.isGlossaryBackedLanguage(language.value, glossaryIndex)
    );
  }

  // The remote engine needs the optional host permission. Ask only when the
  // learner picks it, and fall back to the on-device engine if they decline.
  async function ensureRemotePermission(nextEngine, isCurrent) {
    if (C.engineUsesOllama(nextEngine)) {
      const origins = [C.OLLAMA_ORIGIN];
      if (await chrome.permissions.contains({ origins })) return nextEngine;
      if (!isCurrent()) return nextEngine;

      setEngineNote("ollama.permissionNeeded");
      let granted;
      try {
        granted = await chrome.permissions.request({ origins });
      } catch {
        granted = false;
      }
      if (granted) return nextEngine;

      if (isCurrent()) setEngineNote("ollama.permissionDenied");
      return C.TRANSLATION_ENGINES.DEVICE;
    }
    if (!C.engineAllowsRemote(nextEngine)) return nextEngine;

    const origins = [C.REMOTE_TRANSLATION_ORIGIN];
    if (await chrome.permissions.contains({ origins })) return nextEngine;
    if (!isCurrent()) return nextEngine;

    setEngineNote("engine.permissionNeeded");
    let granted;
    try {
      granted = await chrome.permissions.request({ origins });
    } catch {
      granted = false;
    }
    if (granted) return nextEngine;

    if (isCurrent()) setEngineNote("engine.permissionDenied");
    return C.TRANSLATION_ENGINES.DEVICE;
  }

  function persist(next) {
    Object.assign(settings, next);
    const snapshot = { ...settings };
    const write = () => chrome.storage.local.set({ [C.STORAGE_KEYS.SETTINGS]: snapshot });
    const pending = storageWriteChain.then(write, write);
    storageWriteChain = pending.catch(() => {});
    return pending;
  }

  language.addEventListener("change", async () => {
    updateLanguageSupport();
    await persist({ targetLanguage: language.value });
  });

  engine.addEventListener("change", async () => {
    const generation = ++engineChangeGeneration;
    const requested = C.normalizeTranslationEngine(engine.value);
    if (!C.engineUsesOllama(requested)) ++ollamaHealthGeneration;
    const isCurrent = () =>
      generation === engineChangeGeneration && C.normalizeTranslationEngine(engine.value) === requested;
    const resolved = await ensureRemotePermission(requested, isCurrent);
    if (!isCurrent()) return;
    engine.value = resolved;
    updateOllamaModelVisibility();
    if (resolved === requested) setEngineNote(`engine.note${engineNoteSuffix(resolved)}`);
    await persist({ translationEngine: resolved });
    if (generation === engineChangeGeneration && C.engineUsesOllama(resolved)) await checkOllamaStatus();
  });

  ollamaModel.addEventListener("change", async () => {
    const generation = ++ollamaModelGeneration;
    const model = C.normalizeOllamaModel(ollamaModel.value);
    ollamaModel.value = model;
    ++ollamaHealthGeneration;
    await persist({ ollamaModel: model });
    if (generation === ollamaModelGeneration) await checkOllamaStatus();
  });

  autoTranslate.addEventListener("change", async () => {
    await persist({ autoTranslate: autoTranslate.checked });
  });

  nativeDownloads.addEventListener("change", async () => {
    await persist({ enableBrowserTranslatorDownloads: nativeDownloads.checked });
  });

  ollamaRetry.addEventListener("click", checkOllamaStatus);

  // Persist the resolved first-run defaults so the content script sees them too.
  if (
    settings.targetLanguage !== storedSettings.targetLanguage ||
    settings.translationEngine !== storedSettings.translationEngine ||
    settings.ollamaModel !== storedSettings.ollamaModel
  ) {
    await persist({});
  }
})();
