(async function initPopup() {
  "use strict";

  const C = globalThis.AcademyLensConstants;
  const uiLocale = C.getUiLocale(navigator.language);
  const language = document.getElementById("targetLanguage");
  const autoTranslate = document.getElementById("autoTranslate");
  const nativeDownloads = document.getElementById("nativeDownloads");
  const languageSupport = document.getElementById("languageSupport");
  let glossaryIndex = null;

  document.documentElement.lang = uiLocale;
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = C.getMessage(node.dataset.i18n, uiLocale);
  }

  for (const item of C.SUPPORTED_LANGUAGES) {
    const option = document.createElement("option");
    option.value = item.code;
    option.lang = item.lang || item.code;
    option.textContent = C.getLanguageLabel(item.code, uiLocale);
    language.append(option);
  }

  try {
    const response = await fetch(chrome.runtime.getURL("src/data/glossary.index.json"));
    if (response.ok) glossaryIndex = await response.json();
  } catch {
    glossaryIndex = null;
  }

  const stored = await chrome.storage.local.get([C.STORAGE_KEYS.SETTINGS]);
  const settings = {
    ...C.DEFAULT_SETTINGS,
    ...(stored[C.STORAGE_KEYS.SETTINGS] || {})
  };

  language.value = settings.targetLanguage;
  autoTranslate.checked = Boolean(settings.autoTranslate);
  nativeDownloads.checked = Boolean(settings.enableBrowserTranslatorDownloads);
  updateLanguageSupport();

  function updateLanguageSupport() {
    languageSupport.textContent = C.getLanguageSupportMessage(language.value, uiLocale, glossaryIndex);
    languageSupport.dataset.glossary = String(C.isGlossaryBackedLanguage(language.value, glossaryIndex));
  }

  async function save() {
    updateLanguageSupport();
    await chrome.storage.local.set({
      [C.STORAGE_KEYS.SETTINGS]: {
        ...settings,
        targetLanguage: language.value,
        autoTranslate: autoTranslate.checked,
        enableBrowserTranslatorDownloads: nativeDownloads.checked
      }
    });
  }

  language.addEventListener("change", save);
  autoTranslate.addEventListener("change", save);
  nativeDownloads.addEventListener("change", save);
})();
