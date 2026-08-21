(async function initPopup() {
  "use strict";

  const C = globalThis.AcademyLensConstants;
  const uiLocale = C.getUiLocale(navigator.language);
  const language = document.getElementById("targetLanguage");
  const engine = document.getElementById("translationEngine");
  const engineNote = document.getElementById("engineNote");
  const ollamaModelField = document.getElementById("ollamaModelField");
  const ollamaModel = document.getElementById("ollamaModel");
  const autoTranslate = document.getElementById("autoTranslate");
  const nativeDownloads = document.getElementById("nativeDownloads");
  const languageSupport = document.getElementById("languageSupport");
  let glossaryIndex = null;

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

  function engineNoteSuffix(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function setEngineNote(key) {
    engineNote.textContent = C.getMessage(key, uiLocale);
  }

  function updateOllamaModelVisibility() {
    ollamaModelField.hidden = !C.engineUsesOllama(engine.value);
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
  async function ensureRemotePermission(nextEngine) {
    if (C.engineUsesOllama(nextEngine)) {
      const origins = [C.OLLAMA_ORIGIN];
      if (await chrome.permissions.contains({ origins })) return nextEngine;

      setEngineNote("ollama.permissionNeeded");
      const granted = await chrome.permissions.request({ origins });
      if (granted) return nextEngine;

      setEngineNote("ollama.permissionDenied");
      return C.TRANSLATION_ENGINES.DEVICE;
    }
    if (!C.engineAllowsRemote(nextEngine)) return nextEngine;

    const origins = [C.REMOTE_TRANSLATION_ORIGIN];
    if (await chrome.permissions.contains({ origins })) return nextEngine;

    setEngineNote("engine.permissionNeeded");
    const granted = await chrome.permissions.request({ origins });
    if (granted) return nextEngine;

    setEngineNote("engine.permissionDenied");
    return C.TRANSLATION_ENGINES.DEVICE;
  }

  async function persist(next) {
    Object.assign(settings, next);
    await chrome.storage.local.set({ [C.STORAGE_KEYS.SETTINGS]: { ...settings } });
  }

  language.addEventListener("change", async () => {
    updateLanguageSupport();
    await persist({ targetLanguage: language.value });
  });

  engine.addEventListener("change", async () => {
    const requested = C.normalizeTranslationEngine(engine.value);
    const resolved = await ensureRemotePermission(requested);
    engine.value = resolved;
    updateOllamaModelVisibility();
    if (resolved === requested) setEngineNote(`engine.note${engineNoteSuffix(resolved)}`);
    await persist({ translationEngine: resolved });
  });

  ollamaModel.addEventListener("change", async () => {
    const model = C.normalizeOllamaModel(ollamaModel.value);
    ollamaModel.value = model;
    await persist({ ollamaModel: model });
  });

  autoTranslate.addEventListener("change", async () => {
    await persist({ autoTranslate: autoTranslate.checked });
  });

  nativeDownloads.addEventListener("change", async () => {
    await persist({ enableBrowserTranslatorDownloads: nativeDownloads.checked });
  });

  // Persist the resolved first-run defaults so the content script sees them too.
  if (!storedSettings.targetLanguage || !storedSettings.translationEngine) {
    await persist({});
  }
})();
