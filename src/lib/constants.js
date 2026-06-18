(function initAcademyLensConstants(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.AcademyLensConstants = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function constantsFactory() {
  "use strict";

  const EXTENSION_NAME = "AcademyLens";
  const PRODUCT_FULL_NAME = "AcademyLens for OpenAI Academy (Unofficial)";
  const DISCLAIMER = "Unofficial, not affiliated with OpenAI.";

  const MESSAGE_TYPES = Object.freeze({
    TRANSLATE_BATCH: "ACADEMYLENS_TRANSLATE_BATCH"
  });

  const STORAGE_KEYS = Object.freeze({
    SETTINGS: "academylens.settings",
    CACHE: "academylens.translationCache.v1"
  });

  const DEFAULT_SETTINGS = Object.freeze({
    targetLanguage: "ko",
    autoTranslate: false
  });

  const SUPPORTED_LANGUAGES = Object.freeze([
    { code: "en", label: "English", nativeLabel: "English" },
    { code: "ko", label: "Korean", nativeLabel: "한국어" },
    { code: "ja", label: "Japanese", nativeLabel: "日本語" },
    { code: "zh-CN", label: "Chinese Simplified", nativeLabel: "中文(简体)" },
    { code: "zh-TW", label: "Chinese Traditional", nativeLabel: "中文(繁體)" },
    { code: "es", label: "Spanish", nativeLabel: "Español" },
    { code: "fr", label: "French", nativeLabel: "Français" },
    { code: "it", label: "Italian", nativeLabel: "Italiano" },
    { code: "de", label: "German", nativeLabel: "Deutsch" },
    { code: "pt-BR", label: "Portuguese Brazil", nativeLabel: "Português (BR)" },
    { code: "ru", label: "Russian", nativeLabel: "Русский" },
    { code: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt" },
    { code: "pt", label: "Portuguese Portugal", nativeLabel: "Português (PT)" },
    { code: "nl", label: "Dutch", nativeLabel: "Nederlands" },
    { code: "pl", label: "Polish", nativeLabel: "Polski" },
    { code: "uk", label: "Ukrainian", nativeLabel: "Українська" },
    { code: "cs", label: "Czech", nativeLabel: "Čeština" },
    { code: "sv", label: "Swedish", nativeLabel: "Svenska" },
    { code: "da", label: "Danish", nativeLabel: "Dansk" },
    { code: "fi", label: "Finnish", nativeLabel: "Suomi" },
    { code: "no", label: "Norwegian", nativeLabel: "Norsk" },
    { code: "tr", label: "Turkish", nativeLabel: "Türkçe" },
    { code: "ar", label: "Arabic", nativeLabel: "العربية" },
    { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
    { code: "th", label: "Thai", nativeLabel: "ภาษาไทย" },
    { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia" },
    { code: "ms", label: "Malay", nativeLabel: "Bahasa Melayu" },
    { code: "tl", label: "Filipino", nativeLabel: "Filipino", lang: "fil" },
    { code: "bn", label: "Bengali", nativeLabel: "বাংলা" },
    { code: "iw", label: "Hebrew", nativeLabel: "עברית", lang: "he" },
    { code: "ro", label: "Romanian", nativeLabel: "Română" },
    { code: "hu", label: "Hungarian", nativeLabel: "Magyar" },
    { code: "el", label: "Greek", nativeLabel: "Ελληνικά" }
  ]);

  const UI_MESSAGES = Object.freeze({
    en: Object.freeze({
      "panel.aria": "AcademyLens controls",
      "badge.unofficial": "Unofficial",
      "action.translate": "Translate",
      "action.restore": "Restore",
      "action.collapse": "Collapse AcademyLens panel",
      "action.expand": "Expand AcademyLens panel",
      "field.targetLanguage": "Target language",
      "popup.description": "Translate OpenAI Academy course content in your language.",
      "popup.autoTranslate": "Auto-translate new course text",
      "popup.languageNoteGlossary": "Reviewed community glossary corrections are enabled for this language.",
      "popup.languageNoteDraft": "AI-drafted terminology corrections are enabled. Community review is welcome.",
      "popup.languageNoteMachine":
        "Machine translation with protected terms. A reviewed glossary is not installed for this language yet.",
      "popup.languageTermCount": "{count}+ terminology corrections.",
      "panel.autoTranslate": "Auto",
      "notice.unofficial": DISCLAIMER,
      "status.ready": "Ready on OpenAI Academy.",
      "status.targetLanguage": "Target language: {language}",
      "status.glossaryLoading": "Glossary is still loading.",
      "status.noNewText": "No new course text found.",
      "status.frameDispatch": "Sent translation to embedded course content.",
      "status.frameTranslated": "Translated {count} embedded course text blocks.",
      "status.frameRestored": "Restored embedded course content.",
      "status.translating": "Translating {count} text blocks...",
      "status.translated": "Translated {count} text blocks.",
      "status.translatedPartial": "Translated {count} text blocks. {failed} failed.",
      "status.restored": "Restored {count} text blocks.",
      "status.timeout": "Translation request timed out.",
      "status.failed": "Translation failed."
    }),
    ko: Object.freeze({
      "panel.aria": "AcademyLens 번역 컨트롤",
      "badge.unofficial": "비공식",
      "action.translate": "번역",
      "action.restore": "원문 복원",
      "action.collapse": "AcademyLens 패널 접기",
      "action.expand": "AcademyLens 패널 펼치기",
      "field.targetLanguage": "번역할 언어",
      "popup.description": "OpenAI Academy 강의 내용을 원하는 언어로 번역합니다.",
      "popup.autoTranslate": "새 강의 텍스트 자동 번역",
      "popup.languageNoteGlossary": "이 언어에는 검토된 커뮤니티 용어 사전 보정이 적용됩니다.",
      "popup.languageNoteDraft": "AI 초안 용어 사전 보정이 적용됩니다. 커뮤니티 검수를 기다리고 있습니다.",
      "popup.languageNoteMachine": "기계번역과 보호 용어만 적용됩니다. 이 언어의 용어 사전은 아직 없습니다.",
      "popup.languageTermCount": "{count}개 이상의 용어 보정.",
      "panel.autoTranslate": "자동 번역",
      "notice.unofficial": "비공식 확장 프로그램이며 OpenAI와 제휴되어 있지 않습니다.",
      "status.ready": "OpenAI Academy에서 사용할 준비가 됐습니다.",
      "status.targetLanguage": "번역 언어: {language}",
      "status.glossaryLoading": "용어 사전을 불러오는 중입니다.",
      "status.noNewText": "새로 번역할 강의 텍스트가 없습니다.",
      "status.frameDispatch": "임베드된 강의 콘텐츠에 번역을 전달했습니다.",
      "status.frameTranslated": "임베드된 강의 텍스트 {count}개를 번역했습니다.",
      "status.frameRestored": "임베드된 강의 콘텐츠를 원문으로 복원했습니다.",
      "status.translating": "텍스트 {count}개 번역 중...",
      "status.translated": "텍스트 {count}개를 번역했습니다.",
      "status.translatedPartial": "텍스트 {count}개를 번역했습니다. {failed}개는 실패했습니다.",
      "status.restored": "텍스트 {count}개를 원문으로 복원했습니다.",
      "status.timeout": "번역 요청 시간이 초과되었습니다.",
      "status.failed": "번역에 실패했습니다."
    })
  });

  const ACADEMY_URL_PATTERNS = Object.freeze([
    /^https:\/\/academy\.openai\.com\/?$/i,
    /^https:\/\/academy\.openai\.com\/[a-z-]+\/?$/i,
    /^https:\/\/academy\.openai\.com\/(?:[a-z-]+\/)?pages\/courses/i,
    /^https:\/\/academy\.openai\.com\/(?:[a-z-]+\/)?public\/courses\//i,
    /^https:\/\/academy\.openai\.com\/(?:[a-z-]+\/)?courses\//i,
    /^https:\/\/academy\.openai\.com\/learn\//i,
    /^https:\/\/academy\.openai\.com\/api\/courses\/[^/]+\/scorm-proxy\//i
  ]);

  const EXCLUDED_SELECTOR = [
    "script",
    "style",
    "noscript",
    "svg",
    "canvas",
    "iframe",
    "textarea",
    "input",
    "button",
    "select",
    "option",
    "code",
    "pre",
    "kbd",
    "samp",
    "form",
    "label",
    "nav",
    "[role='navigation']",
    "[role='button']",
    "[role='dialog']",
    "[role='progressbar']",
    "[aria-valuenow]",
    "[contenteditable='true']",
    "[data-academylens-skip]",
    "[data-testid*='account' i]",
    "[data-testid*='breadcrumb' i]",
    "[data-testid*='certificate' i]",
    "[data-testid*='footer' i]",
    "[data-testid*='navigation' i]",
    "[data-testid*='participant' i]",
    "[data-testid*='progress' i]",
    "[data-testid*='quiz' i]",
    "[data-testid*='share' i]",
    "[aria-label*='breadcrumb' i]",
    "[aria-label*='footer' i]",
    "[aria-label*='share' i]",
    "[class*='breadcrumb' i]",
    "[class*='footer' i]",
    "[class*='share' i]",
    "[role='contentinfo']",
    "footer",
    "#gradual-topbar",
    "#gradual-sidebar",
    "#gradual-footer",
    ".academylens-root"
  ].join(",");

  const LIMITS = Object.freeze({
    maxTextNodesPerPass: 120,
    maxBatchSize: 40,
    maxTextLength: 1200,
    cacheEntries: 600
  });

  function isAcademyUrl(url) {
    return ACADEMY_URL_PATTERNS.some((pattern) => pattern.test(url));
  }

  function getUiLocale(locale) {
    return String(locale || "")
      .toLowerCase()
      .startsWith("ko")
      ? "ko"
      : "en";
  }

  function getMessage(key, locale, params) {
    const messages = UI_MESSAGES[getUiLocale(locale)] || UI_MESSAGES.en;
    const fallback = UI_MESSAGES.en[key] || key;
    const template = messages[key] || fallback;
    return Object.entries(params || {}).reduce(
      (message, entry) => message.replace(new RegExp(`\\{${entry[0]}\\}`, "g"), String(entry[1])),
      template
    );
  }

  function getLanguageLabel(code) {
    const language = SUPPORTED_LANGUAGES.find((item) => item.code === code);
    if (!language) return code;
    return language.nativeLabel || language.label;
  }

  function getGlossaryRecord(code, glossaryIndex) {
    if (glossaryIndex && Array.isArray(glossaryIndex.glossaries)) {
      return glossaryIndex.glossaries.find((entry) => entry && entry.locale === code) || null;
    }
    return null;
  }

  function isGlossaryBackedLanguage(code, glossaryIndex) {
    return Boolean(getGlossaryRecord(code, glossaryIndex));
  }

  function getLanguageSupportMessage(code, locale, glossaryIndex) {
    const record = getGlossaryRecord(code, glossaryIndex);
    if (!record) return getMessage("popup.languageNoteMachine", locale);
    const note = getMessage(
      record.status === "reviewed" ? "popup.languageNoteGlossary" : "popup.languageNoteDraft",
      locale
    );
    if (!record.termCount) return note;
    return `${note} ${getMessage("popup.languageTermCount", locale, { count: record.termCount })}`;
  }

  return Object.freeze({
    EXTENSION_NAME,
    PRODUCT_FULL_NAME,
    DISCLAIMER,
    MESSAGE_TYPES,
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    SUPPORTED_LANGUAGES,
    EXCLUDED_SELECTOR,
    LIMITS,
    getLanguageLabel,
    getGlossaryRecord,
    getLanguageSupportMessage,
    getMessage,
    getUiLocale,
    isGlossaryBackedLanguage,
    isAcademyUrl
  });
});
