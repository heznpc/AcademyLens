(function initAcademyLensTranslationQuality(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  /** @type {any} */ (root).AcademyLensTranslationQuality = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function translationQualityFactory() {
  "use strict";

  const PLACEHOLDER_PATTERN = /__AL_[A-Z0-9_]+__/g;
  // Capitalization alone is not neutral: Academy headings commonly use Title
  // Case. Exclude only known product/technical tokens from language evidence.
  const DETECTION_NEUTRAL_PATTERN =
    /https?:\/\/\S+|www\.\S+|mailto:\S+|\b(?:OpenAI(?:\s+Academy)?|ChatGPT|GPT-?\d*|JSON|API|SDK|LLM|Python)\b/gi;
  const MIN_DETECTION_LETTERS = 20;
  const MIN_DETECTION_PERCENTAGE = 80;
  const SIMPLIFIED_CHINESE_EVIDENCE = new Set(
    "这为个们来时会说对发国学东车门见长开关问间里后过还进从无与业书体汉语译简边变数现点应实认让给经线结统历万两并内写达选区级将种样机权动当产头面条气总"
  );
  const TRADITIONAL_CHINESE_EVIDENCE = new Set(
    "這為個們來時會說對發國學東車門見長開關問間裡後過還進從無與業書體漢語譯簡邊變數現點應實認讓給經線結統歷萬兩並內寫達選區級將種樣機權動當產頭面條氣總"
  );

  // Every supported target is classified, but only scripts that can actually
  // distinguish the target from English get a script guard. Latin-script
  // languages deliberately use source-copy/leakage checks instead of pretending
  // that a Latin character check can tell Spanish from English.
  const TARGET_LANGUAGE_GROUPS = Object.freeze({
    en: "latin",
    ko: "hangul",
    ja: "japanese",
    "zh-CN": "han",
    "zh-TW": "han",
    es: "latin",
    fr: "latin",
    it: "latin",
    de: "latin",
    "pt-BR": "latin",
    ru: "cyrillic",
    vi: "latin",
    pt: "latin",
    nl: "latin",
    pl: "latin",
    uk: "cyrillic",
    cs: "latin",
    sv: "latin",
    da: "latin",
    fi: "latin",
    no: "latin",
    tr: "latin",
    ar: "arabic",
    hi: "devanagari",
    th: "thai",
    id: "latin",
    ms: "latin",
    tl: "latin",
    bn: "bengali",
    iw: "hebrew",
    ro: "latin",
    hu: "latin",
    el: "greek"
  });

  const SCRIPT_GROUP_GUARDS = Object.freeze({
    hangul: Object.freeze({ pattern: /[\u3131-\uD7A3]/g, minChars: 2 }),
    japanese: Object.freeze({ pattern: /[\u3040-\u30FF\u3400-\u9FFF]/g, minChars: 2 }),
    han: Object.freeze({ pattern: /[\u3400-\u9FFF]/g, minChars: 2 }),
    cyrillic: Object.freeze({ pattern: /[\u0400-\u052F]/g, minChars: 3 }),
    arabic: Object.freeze({ pattern: /[\u0600-\u06FF]/g, minChars: 3 }),
    devanagari: Object.freeze({ pattern: /[\u0900-\u097F]/g, minChars: 3 }),
    thai: Object.freeze({ pattern: /[\u0E00-\u0E7F]/g, minChars: 3 }),
    bengali: Object.freeze({ pattern: /[\u0980-\u09FF]/g, minChars: 3 }),
    hebrew: Object.freeze({ pattern: /[\u0590-\u05FF]/g, minChars: 3 }),
    greek: Object.freeze({ pattern: /[\u0370-\u03FF\u1F00-\u1FFF]/g, minChars: 3 })
  });

  const SCRIPT_GUARDS = Object.freeze(
    Object.fromEntries(
      Object.entries(TARGET_LANGUAGE_GROUPS)
        .filter(([, group]) => SCRIPT_GROUP_GUARDS[group])
        .map(([language, group]) => [language, SCRIPT_GROUP_GUARDS[group]])
    )
  );

  // This is intentionally evidence-based rather than a Latin "script guard".
  // A result is identified as English only when it is long enough and a strong
  // majority of its words are unambiguous English vocabulary. Short labels and
  // translations containing one or two technical loanwords remain unknown.
  const ENGLISH_EVIDENCE_WORDS = new Set([
    "agent",
    "agents",
    "answer",
    "assessment",
    "before",
    "build",
    "clear",
    "completely",
    "course",
    "create",
    "english",
    "exercises",
    "final",
    "human",
    "improve",
    "improves",
    "includes",
    "information",
    "instructions",
    "learning",
    "model",
    "native",
    "output",
    "oversight",
    "practical",
    "provider",
    "quality",
    "reliable",
    "response",
    "responses",
    "review",
    "safe",
    "safely",
    "sensitive",
    "sentence",
    "sharing",
    "systems",
    "this",
    "translated",
    "translation",
    "unique",
    "unrelated",
    "with",
    "without"
  ]);

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

  function countCharacterEvidence(value, evidence) {
    return Array.from(String(value || "")).filter((character) => evidence.has(character)).length;
  }

  function chineseVariantIssue(value, targetLanguage) {
    if (targetLanguage !== "zh-CN" && targetLanguage !== "zh-TW") return "";
    const simplified = countCharacterEvidence(value, SIMPLIFIED_CHINESE_EVIDENCE);
    const traditional = countCharacterEvidence(value, TRADITIONAL_CHINESE_EVIDENCE);
    if (targetLanguage === "zh-TW" && simplified >= 2 && traditional === 0) {
      return "wrong-target-variant:zh-CN";
    }
    if (targetLanguage === "zh-CN" && traditional >= 2 && simplified === 0) {
      return "wrong-target-variant:zh-TW";
    }
    return "";
  }

  function stripNonLanguageContent(value) {
    return normalize(value).replace(PLACEHOLDER_PATTERN, " ").replace(DETECTION_NEUTRAL_PATTERN, " ");
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

  function englishLanguageEvidence(value) {
    const words =
      normalize(value)
        .replace(PLACEHOLDER_PATTERN, " ")
        .replace(/https?:\/\/\S+|www\.\S+|mailto:\S+/gi, " ")
        .toLowerCase()
        .match(/\b[a-z]{3,}\b/g) || [];
    const evidence = words.filter((word) => ENGLISH_EVIDENCE_WORDS.has(word));
    return Object.freeze({
      words: words.length,
      evidence: evidence.length,
      ratio: words.length ? evidence.length / words.length : 0
    });
  }

  function canonicalTargetLanguage(value) {
    const normalized = String(value || "")
      .trim()
      .replace("_", "-")
      .toLowerCase();
    if (normalized === "he") return "iw";
    if (normalized === "fil") return "tl";
    if (normalized === "zh" || normalized === "zh-hans") return "zh-CN";
    if (normalized === "zh-hant" || normalized === "zh-hk") return "zh-TW";
    return Object.keys(TARGET_LANGUAGE_GROUPS).find((language) => language.toLowerCase() === normalized) || "";
  }

  function languageDetectionText(value) {
    return normalize(value)
      .replace(PLACEHOLDER_PATTERN, " ")
      .replace(DETECTION_NEUTRAL_PATTERN, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function languageFamily(value) {
    const normalized = String(value || "")
      .trim()
      .replace(/_/g, "-")
      .toLowerCase();
    const primary = normalized.split("-")[0];
    if (primary === "iw" || primary === "he") return "he";
    if (primary === "fil" || primary === "tl") return "fil";
    return primary;
  }

  function languagesEquivalent(left, right) {
    const leftFamily = languageFamily(left);
    const rightFamily = languageFamily(right);
    return Boolean(leftFamily && rightFamily && leftFamily === rightFamily);
  }

  function reliableLeadingLanguage(result) {
    if (!result || result.isReliable !== true || !Array.isArray(result.languages)) return "";
    const leading = result.languages
      .map((item) => ({
        language: String((item && item.language) || ""),
        percentage: Number(item && item.percentage)
      }))
      .filter((item) => languageFamily(item.language) !== "und" && Number.isFinite(item.percentage))
      .sort((left, right) => right.percentage - left.percentage)[0];
    return leading && leading.percentage >= MIN_DETECTION_PERCENTAGE ? leading.language : "";
  }

  function detectionIssue(result, targetLanguage) {
    const leadingLanguage = reliableLeadingLanguage(result);
    if (!leadingLanguage) return "";
    if (languagesEquivalent(leadingLanguage, targetLanguage)) return "";
    return `detected-language-mismatch:${languageFamily(leadingLanguage) || leadingLanguage.toLowerCase()}`;
  }

  function validationProfile(targetLanguage) {
    const canonical = canonicalTargetLanguage(targetLanguage);
    const group = TARGET_LANGUAGE_GROUPS[canonical] || "unknown";
    return Object.freeze({
      targetLanguage: canonical,
      group,
      languageDetection: SCRIPT_GUARDS[canonical]
        ? "target-script"
        : canonical && canonical !== "en"
          ? "english-evidence-and-source-leakage"
          : "none",
      supplementalLanguageDetection: "chrome-i18n-when-reliable"
    });
  }

  function qualityIssue(original, translated, targetLanguage) {
    const source = normalize(original);
    const result = normalize(translated);
    const profile = validationProfile(targetLanguage);
    if (!result) return "empty-translation";
    if (!sameTokens(placeholderTokens(source), placeholderTokens(result))) return "placeholder-drift";
    if (profile.targetLanguage !== "en" && source === result && /[A-Za-z]/.test(source)) return "source-copy";
    const variantIssue = chineseVariantIssue(result, profile.targetLanguage);
    if (variantIssue) return variantIssue;

    const sourceHasEnglishWords = /[A-Za-z]{4}/.test(stripNonLanguageContent(source));
    const guard = SCRIPT_GUARDS[profile.targetLanguage];
    if (guard && sourceHasEnglishWords && countMatches(result, guard.pattern) < guard.minChars) {
      return "target-script-missing";
    }

    if (profile.group === "latin" && profile.targetLanguage !== "en" && sourceHasEnglishWords) {
      const english = englishLanguageEvidence(result);
      if (english.words >= 4 && english.evidence >= 3 && english.ratio >= 0.6) {
        return "wrong-target-language:en";
      }
    }

    if (profile.targetLanguage && profile.targetLanguage !== "en" && sourceHasEnglishWords) {
      const leaked = sourceLeakageWords(source, result);
      // Distinct-script targets should not retain even one ordinary English
      // source word. Latin targets use a deliberately conservative threshold:
      // two copied words indicate leakage, while one shared loanword does not.
      const leakageThreshold = guard ? 1 : 2;
      if (leaked.length >= leakageThreshold) {
        return `source-leakage:${leaked.slice(0, 3).join(",")}`;
      }
    }
    return "";
  }

  function validate(original, translated, targetLanguage) {
    const issue = qualityIssue(original, translated, targetLanguage);
    return Object.freeze({ ok: !issue, issue });
  }

  async function validateAsync(original, translated, targetLanguage, detectLanguage) {
    const syncResult = validate(original, translated, targetLanguage);
    const profile = validationProfile(targetLanguage);
    const latinLeakageWords =
      !syncResult.ok && profile.group === "latin" && /^source-leakage:/.test(syncResult.issue)
        ? sourceLeakageWords(original, translated)
        : [];
    const canConfirmLatinLeakage = latinLeakageWords.length === 2;
    if ((!syncResult.ok && !canConfirmLatinLeakage) || typeof detectLanguage !== "function") return syncResult;

    const sample = languageDetectionText(translated);
    const letters = sample.match(/\p{L}/gu) || [];
    if (letters.length < MIN_DETECTION_LETTERS) return syncResult;

    try {
      const detection = await detectLanguage(sample);
      const issue = detectionIssue(detection, targetLanguage);
      if (issue) return Object.freeze({ ok: false, issue });
      if (canConfirmLatinLeakage && languagesEquivalent(reliableLeadingLanguage(detection), targetLanguage)) {
        return Object.freeze({ ok: true, issue: "" });
      }
      return syncResult;
    } catch {
      return syncResult;
    }
  }

  return Object.freeze({
    TARGET_LANGUAGE_GROUPS,
    SCRIPT_GROUP_GUARDS,
    SCRIPT_GUARDS,
    canonicalTargetLanguage,
    chineseVariantIssue,
    detectionIssue,
    englishLanguageEvidence,
    languageDetectionText,
    languagesEquivalent,
    placeholderTokens,
    qualityIssue,
    sourceLeakageWords,
    validationProfile,
    validate,
    validateAsync
  });
});
