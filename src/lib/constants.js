(function initAcademyLensConstants(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.AcademyLensConstants = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function constantsFactory() {
  "use strict";

  const EXTENSION_NAME = "AcademyLens";
  const PRODUCT_FULL_NAME = "AcademyLens — AI Course Translator (Unofficial)";
  const DISCLAIMER = "Unofficial, not affiliated with OpenAI.";

  // Translation engines the learner can pick between.
  //   device — Chrome's built-in on-device Translator API only. Nothing leaves the device.
  //   auto   — on-device first, remote Google Translate only when the device path cannot serve
  //            the selected language pair. Requires the optional host permission.
  //   remote — always remote Google Translate. For browsers or language pairs the
  //            on-device translator does not support. Requires the optional host permission.
  const TRANSLATION_ENGINES = Object.freeze({
    DEVICE: "device",
    AUTO: "auto",
    REMOTE: "remote",
    OLLAMA: "ollama"
  });

  const TRANSLATION_ENGINE_VALUES = Object.freeze([
    TRANSLATION_ENGINES.DEVICE,
    TRANSLATION_ENGINES.AUTO,
    TRANSLATION_ENGINES.REMOTE,
    TRANSLATION_ENGINES.OLLAMA
  ]);

  // Declared as an optional host permission so a default install never grants it.
  const REMOTE_TRANSLATION_ORIGIN = "https://translate.googleapis.com/*";
  const OLLAMA_ORIGIN = "http://localhost:11434/*";
  const OLLAMA_MODELS = Object.freeze([
    "gemma3:4b",
    "qwen3.5:4b",
    "qwen3.5:9b",
    "aya-expanse:8b",
    "qwen2.5-coder:7b",
    "gemma4:12b"
  ]);
  const DEFAULT_OLLAMA_MODEL = "qwen3.5:4b";

  const MESSAGE_TYPES = Object.freeze({
    TRANSLATE_BATCH: "ACADEMYLENS_TRANSLATE_BATCH",
    CANCEL_TRANSLATION: "ACADEMYLENS_CANCEL_TRANSLATION",
    CHECK_OLLAMA: "ACADEMYLENS_CHECK_OLLAMA",
    PERSIST_CACHE_UPDATES: "ACADEMYLENS_PERSIST_CACHE_UPDATES",
    CLEAR_CACHE: "ACADEMYLENS_CLEAR_CACHE"
  });

  const STORAGE_KEYS = Object.freeze({
    SETTINGS: "academylens.settings",
    CACHE: "academylens.translationCache.v1",
    CACHE_EPOCH: "academylens.translationCacheEpoch.v1",
    CORRECTIONS: "academylens.localCorrections.v1"
  });

  // targetLanguage intentionally starts empty. Measured install data shows the
  // browser-language mix is led by English, Italian, and Spanish, so hardcoding a
  // single default language is wrong for most installs. resolveDefaultTargetLanguage
  // derives a first-run suggestion from the browser instead.
  const DEFAULT_SETTINGS = Object.freeze({
    targetLanguage: "",
    autoTranslate: false,
    enableBrowserTranslatorDownloads: false,
    translationEngine: TRANSLATION_ENGINES.DEVICE,
    ollamaModel: DEFAULT_OLLAMA_MODEL
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
      "popup.nativeDownloads": "Allow built-in translator downloads",
      "field.translationEngine": "Translation engine",
      "engine.device": "On-device only",
      "engine.auto": "On-device, then Google Translate",
      "engine.remote": "Google Translate",
      "engine.ollama": "Local Ollama",
      "engine.noteDevice": "Chrome translates on your device. No course text leaves your computer.",
      "engine.noteAuto":
        "Chrome translates on your device when it can. Otherwise the course text for that request is sent to Google Translate.",
      "engine.noteRemote": "Course text is sent to Google Translate. Works on older Chrome and more language pairs.",
      "engine.noteOllama": "Course text is sent only to Ollama on this computer.",
      "engine.permissionNeeded": "Sending text to Google Translate needs your permission.",
      "engine.permissionDenied": "Permission declined, so AcademyLens stayed on the on-device engine.",
      "field.ollamaModel": "Ollama model",
      "ollama.permissionNeeded": "Connecting to Ollama on localhost needs your permission.",
      "ollama.permissionDenied": "Permission declined, so AcademyLens stayed on the on-device engine.",
      "ollama.checking": "Checking Ollama...",
      "ollama.ready": "Ollama is ready. {model} is installed.",
      "ollama.offline": "Ollama is not responding. Start the local server and check again.",
      "ollama.modelMissing": "Ollama is running, but {model} is not installed.",
      "ollama.checkAgain": "Check again",
      "popup.languageNoteGlossary": "Reviewed terminology corrections are enabled for this language.",
      "popup.languageNoteCommunity": "Community-reviewed terminology corrections are enabled for this language.",
      "popup.languageNoteAudited":
        "AI-audited terminology corrections are enabled. Community and native review are welcome.",
      "popup.languageNoteDraft": "AI-drafted terminology corrections are enabled. Community review is welcome.",
      "popup.languageNoteMachine":
        "Machine translation with protected terms. A reviewed glossary is not installed for this language yet.",
      "popup.languageTermCount": "{count}+ terminology corrections.",
      "panel.autoTranslate": "Auto",
      "panel.nativeDownloads": "Native",
      "panel.correction": "Correction",
      "panel.corrections": "Saved corrections",
      "panel.noCorrections": "No saved corrections",
      "panel.diagnostics": "Diagnostics",
      "panel.diagnosticsIdle": "No translation run yet",
      "panel.diagnosticsSummary":
        "Provider {provider}; cache {hits}/{misses}; fallback {fallback}; corrections {corrections}; groups {groups}; frames {frameApplied}/{frameFailed}.",
      "action.saveCorrection": "Save",
      "action.cancelCorrection": "Cancel",
      "action.deleteCorrection": "Delete",
      "action.clearCorrections": "Clear all",
      "action.clearCache": "Clear cache",
      "action.confirmDeleteCorrection": "Confirm delete",
      "action.confirmClearCorrections": "Confirm clear all",
      "action.confirmClearCache": "Confirm clear cache",
      "status.cacheCleared": "Local translation cache cleared.",
      "status.correctionsCleared": "Local corrections cleared.",
      "status.correctionDeleted": "Local correction deleted.",
      "status.confirmLocalDelete": "Click again to confirm local deletion.",
      "notice.unofficial": DISCLAIMER,
      "provider.checking": "Checking provider",
      "provider.native": "Built-in",
      "provider.nativeReady": "Built-in ready",
      "provider.nativeDownloadable": "Built-in available",
      "provider.nativeDownloading": "Built-in downloading",
      "provider.fallback": "Fallback",
      "provider.background": "Background",
      "provider.local": "Local correction",
      "provider.ollama": "Local Ollama",
      "status.ready": "Ready on OpenAI Academy.",
      "status.targetLanguage": "Target language: {language}",
      "status.glossaryLoading": "Glossary is still loading.",
      "status.noNewText": "No new course text found.",
      "status.frameDispatch": "Sent translation to embedded course content.",
      "status.frameTranslated": "Translated {count} embedded course text blocks.",
      "status.frameFailed": "Embedded course translation failed for {failed} text blocks.",
      "status.translatedWithFrames": "Translated {count} page and {frameCount} embedded text blocks.",
      "status.frameRestored": "Restored embedded course content.",
      "status.translating": "Translating {count} text blocks...",
      "status.translated": "Translated {count} text blocks.",
      "status.translatedPartial": "Translated {count} text blocks. {failed} failed.",
      "status.translatedCapped": "Translated {count} text blocks. More text remains.",
      "status.restored": "Restored {count} text blocks.",
      "status.timeout": "Translation request timed out.",
      "status.failed": "Translation failed.",
      "progress.translation": "Translation progress"
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
      "popup.nativeDownloads": "내장 번역 다운로드 허용",
      "field.translationEngine": "번역 엔진",
      "engine.device": "기기 내 번역만",
      "engine.auto": "기기 내 번역, 실패 시 Google 번역",
      "engine.remote": "Google 번역",
      "engine.ollama": "로컬 Ollama",
      "engine.noteDevice": "Chrome이 기기 안에서 번역합니다. 강의 텍스트가 컴퓨터를 벗어나지 않습니다.",
      "engine.noteAuto":
        "가능하면 기기 안에서 번역하고, 불가능한 경우 해당 요청의 강의 텍스트를 Google 번역으로 보냅니다.",
      "engine.noteRemote": "강의 텍스트를 Google 번역으로 보냅니다. 구형 Chrome과 더 많은 언어쌍에서 동작합니다.",
      "engine.noteOllama": "강의 텍스트를 이 컴퓨터의 Ollama로만 보냅니다.",
      "engine.permissionNeeded": "Google 번역으로 텍스트를 보내려면 권한이 필요합니다.",
      "engine.permissionDenied": "권한이 거부되어 기기 내 번역 엔진을 유지했습니다.",
      "field.ollamaModel": "Ollama 모델",
      "ollama.permissionNeeded": "localhost의 Ollama에 연결하려면 권한이 필요합니다.",
      "ollama.permissionDenied": "권한이 거부되어 기기 내 번역 엔진을 유지했습니다.",
      "ollama.checking": "Ollama 연결을 확인하는 중입니다...",
      "ollama.ready": "Ollama가 준비됐습니다. {model} 모델이 설치되어 있습니다.",
      "ollama.offline": "Ollama가 응답하지 않습니다. 로컬 서버를 실행한 뒤 다시 확인하세요.",
      "ollama.modelMissing": "Ollama는 실행 중이지만 {model} 모델이 설치되어 있지 않습니다.",
      "ollama.checkAgain": "다시 확인",
      "popup.languageNoteGlossary": "이 언어에는 검토 완료된 용어 보정이 적용됩니다.",
      "popup.languageNoteCommunity": "이 언어에는 커뮤니티 검토를 거친 용어 보정이 적용됩니다.",
      "popup.languageNoteAudited":
        "이 언어에는 AI 2차 감사를 거친 용어 보정이 적용됩니다. 커뮤니티 및 원어민 검수를 기다리고 있습니다.",
      "popup.languageNoteDraft": "AI 초안 용어 사전 보정이 적용됩니다. 커뮤니티 검수를 기다리고 있습니다.",
      "popup.languageNoteMachine": "기계번역과 보호 용어만 적용됩니다. 이 언어의 용어 사전은 아직 없습니다.",
      "popup.languageTermCount": "{count}개 이상의 용어 보정.",
      "panel.autoTranslate": "자동 번역",
      "panel.nativeDownloads": "내장",
      "panel.correction": "보정",
      "panel.corrections": "저장된 보정",
      "panel.noCorrections": "저장된 보정 없음",
      "panel.diagnostics": "진단",
      "panel.diagnosticsIdle": "아직 번역 실행 기록이 없습니다",
      "panel.diagnosticsSummary":
        "경로 {provider}; 캐시 {hits}/{misses}; 대체 {fallback}; 보정 {corrections}; 묶음 {groups}; 프레임 {frameApplied}/{frameFailed}.",
      "action.saveCorrection": "저장",
      "action.cancelCorrection": "취소",
      "action.deleteCorrection": "삭제",
      "action.clearCorrections": "전체 삭제",
      "action.clearCache": "캐시 비우기",
      "action.confirmDeleteCorrection": "삭제 확인",
      "action.confirmClearCorrections": "전체 삭제 확인",
      "action.confirmClearCache": "캐시 비우기 확인",
      "status.cacheCleared": "로컬 번역 캐시를 비웠습니다.",
      "status.correctionsCleared": "로컬 보정을 모두 삭제했습니다.",
      "status.correctionDeleted": "로컬 보정을 삭제했습니다.",
      "status.confirmLocalDelete": "로컬 삭제를 확인하려면 한 번 더 누르세요.",
      "notice.unofficial": "비공식 확장 프로그램이며 OpenAI와 제휴되어 있지 않습니다.",
      "provider.checking": "번역 경로 확인 중",
      "provider.native": "내장 번역",
      "provider.nativeReady": "내장 번역 준비됨",
      "provider.nativeDownloadable": "내장 번역 사용 가능",
      "provider.nativeDownloading": "내장 번역 다운로드 중",
      "provider.fallback": "대체 경로",
      "provider.background": "백그라운드",
      "provider.local": "로컬 보정",
      "provider.ollama": "로컬 Ollama",
      "status.ready": "OpenAI Academy에서 사용할 준비가 됐습니다.",
      "status.targetLanguage": "번역 언어: {language}",
      "status.glossaryLoading": "용어 사전을 불러오는 중입니다.",
      "status.noNewText": "새로 번역할 강의 텍스트가 없습니다.",
      "status.frameDispatch": "임베드된 강의 콘텐츠에 번역을 전달했습니다.",
      "status.frameTranslated": "임베드된 강의 텍스트 {count}개를 번역했습니다.",
      "status.frameFailed": "임베드된 강의 텍스트 {failed}개 번역에 실패했습니다.",
      "status.translatedWithFrames": "페이지 텍스트 {count}개와 임베드 텍스트 {frameCount}개를 번역했습니다.",
      "status.frameRestored": "임베드된 강의 콘텐츠를 원문으로 복원했습니다.",
      "status.translating": "텍스트 {count}개 번역 중...",
      "status.translated": "텍스트 {count}개를 번역했습니다.",
      "status.translatedPartial": "텍스트 {count}개를 번역했습니다. {failed}개는 실패했습니다.",
      "status.translatedCapped": "텍스트 {count}개를 번역했습니다. 남은 텍스트가 있습니다.",
      "status.restored": "텍스트 {count}개를 원문으로 복원했습니다.",
      "status.timeout": "번역 요청 시간이 초과되었습니다.",
      "status.failed": "번역에 실패했습니다.",
      "progress.translation": "번역 진행률"
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
    "[role='status']",
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
    maxCandidateScanNodes: 600,
    maxTranslationPasses: 8,
    maxBatchSize: 40,
    maxTextLength: 1200,
    cacheEntries: 600
  });

  function isAcademyUrl(url) {
    return ACADEMY_URL_PATTERNS.some((pattern) => pattern.test(url));
  }

  // Browser locale tags that do not match a supported code directly.
  const LANGUAGE_TAG_ALIASES = Object.freeze({
    he: "iw",
    fil: "tl",
    nb: "no",
    nn: "no",
    "zh-hant": "zh-TW",
    "zh-hk": "zh-TW",
    "zh-mo": "zh-TW",
    "zh-hans": "zh-CN",
    "zh-sg": "zh-CN",
    "pt-pt": "pt"
  });

  const SUPPORTED_LANGUAGE_CODES = Object.freeze(SUPPORTED_LANGUAGES.map((item) => item.code));

  function isSupportedLanguage(code) {
    return SUPPORTED_LANGUAGE_CODES.includes(code);
  }

  function matchSupportedLanguage(tag) {
    const normalized = String(tag || "").trim();
    if (!normalized) return "";

    const lower = normalized.toLowerCase();
    if (LANGUAGE_TAG_ALIASES[lower]) return LANGUAGE_TAG_ALIASES[lower];

    const exact = SUPPORTED_LANGUAGE_CODES.find((code) => code.toLowerCase() === lower);
    if (exact) return exact;

    const base = lower.split("-")[0];
    if (LANGUAGE_TAG_ALIASES[base]) return LANGUAGE_TAG_ALIASES[base];

    const baseMatch = SUPPORTED_LANGUAGE_CODES.find((code) => code.toLowerCase() === base);
    return baseMatch || "";
  }

  // Picks a first-run target language from the browser's preferred locales.
  // English is skipped because the course source text is already English, so an
  // English browser gives no signal about the language the learner wants.
  function resolveDefaultTargetLanguage(locales) {
    const tags = (Array.isArray(locales) ? locales : [locales]).filter(Boolean);
    for (const tag of tags) {
      const match = matchSupportedLanguage(tag);
      if (match && match !== "en") return match;
    }
    return "";
  }

  function normalizeTranslationEngine(value) {
    return TRANSLATION_ENGINE_VALUES.includes(value) ? value : TRANSLATION_ENGINES.DEVICE;
  }

  // True when the engine is allowed to reach the remote Google Translate endpoint.
  function engineAllowsRemote(value) {
    const engine = normalizeTranslationEngine(value);
    return engine === TRANSLATION_ENGINES.AUTO || engine === TRANSLATION_ENGINES.REMOTE;
  }

  // True when the engine should try Chrome's on-device translator first.
  function enginePrefersDevice(value) {
    const engine = normalizeTranslationEngine(value);
    return engine === TRANSLATION_ENGINES.DEVICE || engine === TRANSLATION_ENGINES.AUTO;
  }

  function engineUsesOllama(value) {
    return normalizeTranslationEngine(value) === TRANSLATION_ENGINES.OLLAMA;
  }

  function normalizeOllamaModel(value) {
    return OLLAMA_MODELS.includes(value) ? value : DEFAULT_OLLAMA_MODEL;
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
    const statusMessageKey =
      record.status === "reviewed" || record.status === "native-reviewed"
        ? "popup.languageNoteGlossary"
        : record.status === "community-reviewed"
          ? "popup.languageNoteCommunity"
          : record.status === "llm-audited"
            ? "popup.languageNoteAudited"
            : "popup.languageNoteDraft";
    const note = getMessage(statusMessageKey, locale);
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
    SUPPORTED_LANGUAGE_CODES,
    TRANSLATION_ENGINES,
    TRANSLATION_ENGINE_VALUES,
    REMOTE_TRANSLATION_ORIGIN,
    OLLAMA_ORIGIN,
    OLLAMA_MODELS,
    DEFAULT_OLLAMA_MODEL,
    EXCLUDED_SELECTOR,
    LIMITS,
    engineAllowsRemote,
    enginePrefersDevice,
    engineUsesOllama,
    getLanguageLabel,
    getGlossaryRecord,
    getLanguageSupportMessage,
    getMessage,
    getUiLocale,
    isGlossaryBackedLanguage,
    isSupportedLanguage,
    isAcademyUrl,
    matchSupportedLanguage,
    normalizeTranslationEngine,
    normalizeOllamaModel,
    resolveDefaultTargetLanguage
  });
});
