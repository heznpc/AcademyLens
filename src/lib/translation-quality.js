(function initAcademyLensTranslationQuality(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  /** @type {any} */ (root).AcademyLensTranslationQuality = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function translationQualityFactory() {
  "use strict";

  const PLACEHOLDER_PATTERN = /__AL_[A-Z0-9_]+__/g;
  const SCRIPT_GUARDS = Object.freeze({
    ko: Object.freeze({ pattern: /[\u3131-\uD7A3]/g, minChars: 2 }),
    ja: Object.freeze({ pattern: /[\u3040-\u30FF\u3400-\u9FFF]/g, minChars: 2 }),
    "zh-CN": Object.freeze({ pattern: /[\u3400-\u9FFF]/g, minChars: 2 }),
    "zh-TW": Object.freeze({ pattern: /[\u3400-\u9FFF]/g, minChars: 2 }),
    ru: Object.freeze({ pattern: /[\u0400-\u04FF]/g, minChars: 3 }),
    hi: Object.freeze({ pattern: /[\u0900-\u097F]/g, minChars: 3 }),
    ar: Object.freeze({ pattern: /[\u0600-\u06FF]/g, minChars: 3 }),
    th: Object.freeze({ pattern: /[\u0E00-\u0E7F]/g, minChars: 3 }),
    bn: Object.freeze({ pattern: /[\u0980-\u09FF]/g, minChars: 3 }),
    iw: Object.freeze({ pattern: /[\u0590-\u05FF]/g, minChars: 3 })
  });

  function normalize(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function placeholderTokens(value) {
    return [...normalize(value).matchAll(PLACEHOLDER_PATTERN)].map((match) => match[0]).sort();
  }

  function sameTokens(left, right) {
    return left.length === right.length && left.every((token, index) => token === right[index]);
  }

  function countMatches(value, pattern) {
    pattern.lastIndex = 0;
    return (String(value || "").match(pattern) || []).length;
  }

  function stripNonLanguageContent(value) {
    return normalize(value)
      .replace(PLACEHOLDER_PATTERN, " ")
      .replace(/https?:\/\/\S+|www\.\S+|mailto:\S+/gi, " ")
      .replace(/\b[A-Z][A-Za-z0-9_.-]{2,}\b/g, " ");
  }

  function sourceLeakageWords(original, translated) {
    const sourceWords = new Set(
      (stripNonLanguageContent(original).match(/\b[a-z]{4,}\b/gi) || []).map((word) => word.toLowerCase())
    );
    const resultWords = new Set(
      (stripNonLanguageContent(translated).match(/\b[a-z]{4,}\b/gi) || []).map((word) => word.toLowerCase())
    );
    return [...sourceWords].filter((word) => resultWords.has(word));
  }

  function qualityIssue(original, translated, targetLanguage) {
    const source = normalize(original);
    const result = normalize(translated);
    if (!result) return "empty-translation";
    if (!sameTokens(placeholderTokens(source), placeholderTokens(result))) return "placeholder-drift";
    if (targetLanguage !== "en" && source === result && /[A-Za-z]/.test(source)) return "source-copy";

    const guard = SCRIPT_GUARDS[targetLanguage];
    if (!guard || !/[A-Za-z]{4}/.test(stripNonLanguageContent(source))) return "";
    if (countMatches(result, guard.pattern) < guard.minChars) return "target-script-missing";

    const leaked = sourceLeakageWords(source, result);
    return leaked.length ? `source-leakage:${leaked.slice(0, 3).join(",")}` : "";
  }

  function validate(original, translated, targetLanguage) {
    const issue = qualityIssue(original, translated, targetLanguage);
    return Object.freeze({ ok: !issue, issue });
  }

  return Object.freeze({
    SCRIPT_GUARDS,
    placeholderTokens,
    qualityIssue,
    sourceLeakageWords,
    validate
  });
});
