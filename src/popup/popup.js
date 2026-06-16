(async function initPopup() {
  "use strict";

  const C = globalThis.AcademyLensConstants;
  const uiLocale = C.getUiLocale(navigator.language);
  const language = document.getElementById("targetLanguage");
  const autoTranslate = document.getElementById("autoTranslate");
  const languageSupport = document.getElementById("languageSupport");

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

  const stored = await chrome.storage.local.get([C.STORAGE_KEYS.SETTINGS]);
  const settings = {
    ...C.DEFAULT_SETTINGS,
    ...(stored[C.STORAGE_KEYS.SETTINGS] || {})
  };

  language.value = settings.targetLanguage;
  autoTranslate.checked = Boolean(settings.autoTranslate);
  updateLanguageSupport();

  function updateLanguageSupport() {
    languageSupport.textContent = C.getLanguageSupportMessage(language.value, uiLocale);
    languageSupport.dataset.glossary = String(C.isGlossaryBackedLanguage(language.value));
  }

  async function save() {
    updateLanguageSupport();
    await chrome.storage.local.set({
      [C.STORAGE_KEYS.SETTINGS]: {
        ...settings,
        targetLanguage: language.value,
        autoTranslate: autoTranslate.checked
      }
    });
  }

  language.addEventListener("change", save);
  autoTranslate.addEventListener("change", save);
})();
