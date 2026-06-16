const assert = require("node:assert/strict");
const test = require("node:test");

const Constants = require("../src/lib/constants.js");

test("language labels use native names regardless of UI locale", () => {
  assert.equal(Constants.getLanguageLabel("en", "ko-KR"), "English");
  assert.equal(Constants.getLanguageLabel("ko", "ko-KR"), "한국어");
  assert.equal(Constants.getLanguageLabel("ja", "ko-KR"), "日本語");
  assert.equal(Constants.getLanguageLabel("zh-CN", "ko-KR"), "中文(简体)");
  assert.equal(Constants.getLanguageLabel("zh-TW", "ko-KR"), "中文(繁體)");
  assert.equal(Constants.getLanguageLabel("es", "en-US"), "Español");
  assert.equal(Constants.getLanguageLabel("pt-BR", "en-US"), "Português (BR)");
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
});

test("language support messages distinguish glossary-backed languages", () => {
  assert.equal(Constants.isGlossaryBackedLanguage("ko"), true);
  assert.equal(Constants.isGlossaryBackedLanguage("ja"), false);
  assert.match(Constants.getLanguageSupportMessage("ko", "ko-KR"), /용어 사전/);
  assert.match(Constants.getLanguageSupportMessage("ja", "ko-KR"), /기계번역/);
});
