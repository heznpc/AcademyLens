const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const Constants = require("../src/lib/constants.js");
const glossaryIndex = JSON.parse(readFileSync(join(__dirname, "../src/data/glossary.index.json"), "utf8"));

test("language labels use native names regardless of UI locale", () => {
  assert.equal(Constants.getLanguageLabel("en", "ko-KR"), "English");
  assert.equal(Constants.getLanguageLabel("ko", "ko-KR"), "한국어");
  assert.equal(Constants.getLanguageLabel("ja", "ko-KR"), "日本語");
  assert.equal(Constants.getLanguageLabel("zh-CN", "ko-KR"), "中文(简体)");
  assert.equal(Constants.getLanguageLabel("zh-TW", "ko-KR"), "中文(繁體)");
  assert.equal(Constants.getLanguageLabel("es", "en-US"), "Español");
  assert.equal(Constants.getLanguageLabel("pt-BR", "en-US"), "Português (BR)");
  assert.equal(Constants.getLanguageLabel("hi", "en-US"), "हिन्दी");
  assert.equal(Constants.getLanguageLabel("iw", "ko-KR"), "עברית");
});

test("supported languages follow the endonym picker order", () => {
  assert.deepEqual(
    Constants.SUPPORTED_LANGUAGES.slice(0, 10).map((language) => language.nativeLabel),
    [
      "English",
      "한국어",
      "日本語",
      "中文(简体)",
      "中文(繁體)",
      "Español",
      "Français",
      "Italiano",
      "Deutsch",
      "Português (BR)"
    ]
  );
});

test("UI messages are localized for Korean browsers", () => {
  assert.equal(Constants.getUiLocale("ko-KR"), "ko");
  assert.equal(Constants.getMessage("field.targetLanguage", "ko-KR"), "번역할 언어");
  assert.equal(Constants.getMessage("action.translate", "ko-KR"), "번역");
  assert.equal(Constants.getMessage("status.translated", "ko-KR", { count: 3 }), "텍스트 3개를 번역했습니다.");
  assert.equal(Constants.getMessage("popup.nativeDownloads", "ko-KR"), "내장 번역 다운로드 허용");
  assert.equal(Constants.getMessage("panel.corrections", "ko-KR"), "저장된 보정");
  assert.equal(Constants.getMessage("panel.diagnostics", "ko-KR"), "진단");
  assert.equal(Constants.getMessage("status.cacheCleared", "ko-KR"), "로컬 번역 캐시를 비웠습니다.");
  assert.equal(Constants.getMessage("provider.nativeReady", "ko-KR"), "내장 번역 준비됨");
  assert.equal(
    Constants.getMessage("status.translatedWithFrames", "ko-KR", { count: 3, frameCount: 2 }),
    "페이지 텍스트 3개와 임베드 텍스트 2개를 번역했습니다."
  );
  assert.equal(
    Constants.getMessage("status.translatedCapped", "ko-KR", { count: 120 }),
    "텍스트 120개를 번역했습니다. 남은 텍스트가 있습니다."
  );
  assert.equal(Constants.DEFAULT_SETTINGS.enableBrowserTranslatorDownloads, false);
  assert.equal(Constants.LIMITS.maxCandidateScanNodes, 600);
  assert.equal(Constants.LIMITS.maxTranslationPasses, 8);
});

test("language support messages distinguish glossary-backed languages", () => {
  assert.equal(Constants.isGlossaryBackedLanguage("ko"), false);
  assert.equal(Constants.isGlossaryBackedLanguage("ko", glossaryIndex), true);
  assert.equal(Constants.isGlossaryBackedLanguage("hi", glossaryIndex), true);
  assert.equal(Constants.isGlossaryBackedLanguage("ja", glossaryIndex), true);
  assert.match(Constants.getLanguageSupportMessage("ko", "ko-KR", glossaryIndex), /커뮤니티 검토/);
  assert.match(Constants.getLanguageSupportMessage("ko", "ko-KR", glossaryIndex), /115개/);
  assert.match(Constants.getLanguageSupportMessage("hi", "ko-KR", glossaryIndex), /AI 2차 감사/);
  assert.match(Constants.getLanguageSupportMessage("hi", "en-US", glossaryIndex), /115\+ terminology corrections/);
  assert.match(Constants.getLanguageSupportMessage("ja", "ko-KR", glossaryIndex), /AI 2차 감사/);
  assert.match(Constants.getLanguageSupportMessage("ar", "ko-KR", glossaryIndex), /기계번역/);
});

test("translation engine helpers gate the remote path", () => {
  assert.deepEqual(Constants.TRANSLATION_ENGINE_VALUES, ["device", "remote", "ollama"]);
  assert.equal(Constants.TRANSLATION_ENGINES.AUTO, undefined);
  assert.equal(Constants.DEFAULT_SETTINGS.translationEngine, "device");

  // Unknown or missing values must fall back to the privacy-preserving engine.
  assert.equal(Constants.normalizeTranslationEngine(undefined), "device");
  assert.equal(Constants.normalizeTranslationEngine("auto"), "device");
  assert.equal(Constants.normalizeTranslationEngine("hosted"), "device");
  assert.equal(Constants.normalizeTranslationEngine("remote"), "remote");

  assert.equal(Constants.engineAllowsRemote("device"), false);
  assert.equal(Constants.engineAllowsRemote("auto"), false);
  assert.equal(Constants.engineAllowsRemote("remote"), true);
  assert.equal(Constants.engineAllowsRemote("nonsense"), false);

  assert.equal(Constants.enginePrefersDevice("device"), true);
  assert.equal(Constants.enginePrefersDevice("auto"), true);
  assert.equal(Constants.enginePrefersDevice("remote"), false);
  assert.equal(Constants.engineUsesOllama("ollama"), true);
  assert.equal(Constants.engineUsesOllama("remote"), false);
  assert.equal(Constants.DEFAULT_SETTINGS.ollamaModel, "qwen3.5:4b");
  assert.equal(Constants.normalizeOllamaModel("gemma4:12b"), "gemma4:12b");
  assert.equal(Constants.normalizeOllamaModel("unknown:latest"), "qwen3.5:4b");
});

test("default target language comes from the browser rather than a hardcoded locale", () => {
  assert.equal(Constants.DEFAULT_SETTINGS.targetLanguage, "", "no single language may be assumed for every install");

  assert.equal(Constants.resolveDefaultTargetLanguage(["it-IT", "en-US"]), "it");
  assert.equal(Constants.resolveDefaultTargetLanguage(["es-419"]), "es");
  assert.equal(Constants.resolveDefaultTargetLanguage(["pt-BR"]), "pt-BR");
  assert.equal(Constants.resolveDefaultTargetLanguage(["pt-PT"]), "pt");
  assert.equal(Constants.resolveDefaultTargetLanguage(["zh-Hant"]), "zh-TW");
  assert.equal(Constants.resolveDefaultTargetLanguage(["zh-CN"]), "zh-CN");
  assert.equal(Constants.resolveDefaultTargetLanguage(["he-IL"]), "iw");
  assert.equal(Constants.resolveDefaultTargetLanguage(["nb-NO"]), "no");
  assert.equal(Constants.resolveDefaultTargetLanguage("ko-KR"), "ko");

  // English browsers give no signal about the desired target language.
  assert.equal(Constants.resolveDefaultTargetLanguage(["en-US", "en"]), "");
  assert.equal(Constants.resolveDefaultTargetLanguage(["en-GB"]), "");
  // An English-first browser should still honour a secondary preference.
  assert.equal(Constants.resolveDefaultTargetLanguage(["en-US", "fr-FR"]), "fr");

  assert.equal(Constants.resolveDefaultTargetLanguage([]), "");
  assert.equal(Constants.resolveDefaultTargetLanguage(["zz-ZZ"]), "");
});
