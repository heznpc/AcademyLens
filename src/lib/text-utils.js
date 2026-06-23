(function initAcademyLensTextUtils(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./constants.js"));
    return;
  }

  root.AcademyLensTextUtils = factory(root.AcademyLensConstants);
})(typeof globalThis !== "undefined" ? globalThis : this, function textUtilsFactory(constants) {
  "use strict";

  const EXCLUDED_SELECTOR = constants && constants.EXCLUDED_SELECTOR ? constants.EXCLUDED_SELECTOR : "";

  function stableHash(value) {
    const text = String(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function applyTranslatedText(node, translated) {
    const original = node.textContent;
    const leading = original.match(/^\s*/)[0];
    const trailing = original.match(/\s*$/)[0];
    node.textContent = `${leading}${translated}${trailing}`;
    return original;
  }

  function normalizeWhitespace(value) {
    return String(value).replace(/\s+/g, " ").trim();
  }

  function hasLatinLetters(value) {
    return /[A-Za-z]/.test(value);
  }

  const TARGET_SCRIPT_GUARDS = Object.freeze({
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

  function countPatternMatches(value, pattern) {
    pattern.lastIndex = 0;
    const matches = String(value).match(pattern);
    return matches ? matches.length : 0;
  }

  function containsTargetLanguageScript(value, targetLanguage) {
    const guard = TARGET_SCRIPT_GUARDS[targetLanguage];
    if (!guard) return false;
    return countPatternMatches(value, guard.pattern) >= guard.minChars;
  }

  function normalizeLanguageCode(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace("_", "-");
  }

  function languageMatchesTarget(language, targetLanguage) {
    const source = normalizeLanguageCode(language);
    const target = normalizeLanguageCode(targetLanguage);
    if (!source || !target) return false;
    return source === target || source.split("-")[0] === target.split("-")[0];
  }

  function isMostlyPunctuation(value) {
    const text = normalizeWhitespace(value);
    return !text || /^[\d\s()[\]{}.,:;!?'"`~@#$%^&*+=/\\|<>_-]+$/.test(text);
  }

  function isUrlLike(value) {
    return /^(https?:\/\/|mailto:|www\.)/i.test(normalizeWhitespace(value));
  }

  function isPlatformControlText(value) {
    const text = normalizeWhitespace(value);
    if (!text) return true;

    return [
      /^lesson \d+ of \d+$/i,
      /^\d+\s*\/\s*\d+\s+lessons?\s+completed$/i,
      /^last modified:/i,
      /^time left:/i,
      /^time limit$/i,
      /^passing score$/i,
      /^number of attempts$/i,
      /^course completed$/i,
      /^complete(?: now)?$/i,
      /^completed$/i,
      /^download (?:pdf|certificate)$/i,
      /^view certificate$/i,
      /^copy link(?: to clipboard)?$/i,
      /^publish to linkedin profile$/i,
      /^show table of contents$/i,
      /^exit course$/i,
      /^start quiz$/i,
      /^start learning$/i,
      /^submit$/i,
      /^next$/i,
      /^back$/i,
      /^home$/i,
      /^courses$/i,
      /^events$/i,
      /^content$/i,
      /^communities$/i,
      /^what's new$/i,
      /^stories$/i,
      /^work$/i,
      /^education$/i,
      /^small business$/i,
      /^nonprofits$/i,
      /^government$/i,
      /^news organizations$/i,
      /^help$/i,
      /^participants$/i,
      /^share$/i,
      /^share on (?:x|linkedin)$/i,
      /^share via email$/i,
      /^account$/i,
      /^profile$/i,
      /^settings$/i,
      /^sign in$/i,
      /^search$/i,
      /^terms of use$/i,
      /^privacy policy$/i,
      /^code of conduct$/i,
      /^your privacy choices$/i,
      /^switch language$/i,
      /^powered by gradual$/i
    ].some((pattern) => pattern.test(text));
  }

  function shouldTranslateText(value, targetLanguage, maxLength, element) {
    const text = normalizeWhitespace(value);
    const limit = maxLength || 1200;

    if (targetLanguage === "en") return false;
    if (element && languageMatchesTarget(element.closest("[lang]")?.getAttribute("lang"), targetLanguage)) return false;
    if (containsTargetLanguageScript(text, targetLanguage)) return false;
    if (text.length < 2 || text.length > limit) return false;
    if (!hasLatinLetters(text)) return false;
    if (isMostlyPunctuation(text)) return false;
    if (isUrlLike(text)) return false;
    if (isPlatformControlText(text)) return false;
    if (/^[A-Z0-9_-]{2,12}$/.test(text)) return false;

    return true;
  }

  function isElementVisible(element) {
    if (!element || element.nodeType !== 1) return true;
    if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;

    if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") {
      return true;
    }

    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function isExcludedElement(element) {
    if (!element || element.nodeType !== 1 || !EXCLUDED_SELECTOR) return false;
    return Boolean(element.closest(EXCLUDED_SELECTOR) || findCookieConsentAncestor(element));
  }

  function findCookieConsentAncestor(element) {
    let current = element;
    while (current && current !== document.body && current.nodeType === 1) {
      if (["MAIN", "ARTICLE", "SECTION", "BODY", "HTML"].includes(current.tagName)) {
        return null;
      }
      const text = normalizeWhitespace(current.innerText || current.textContent || "");
      if (
        /cookies?/i.test(text) &&
        (/manage preferences/i.test(text) || /accept all/i.test(text) || /reject all/i.test(text))
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function collectTranslatableTextNodes(root, options) {
    const settings = options || {};
    const doc = root && root.ownerDocument ? root.ownerDocument : document;
    const walker = doc.createTreeWalker(root || doc.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (isExcludedElement(parent)) return NodeFilter.FILTER_REJECT;
        if (!isElementVisible(parent)) return NodeFilter.FILTER_REJECT;
        if (!shouldTranslateText(node.textContent, settings.targetLanguage, settings.maxTextLength, parent)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    let node = walker.nextNode();
    while (node && nodes.length < (settings.maxNodes || 120)) {
      nodes.push(node);
      node = walker.nextNode();
    }

    return nodes;
  }

  return Object.freeze({
    stableHash,
    applyTranslatedText,
    normalizeWhitespace,
    hasLatinLetters,
    languageMatchesTarget,
    containsTargetLanguageScript,
    isMostlyPunctuation,
    isUrlLike,
    isPlatformControlText,
    shouldTranslateText,
    isElementVisible,
    isExcludedElement,
    findCookieConsentAncestor,
    collectTranslatableTextNodes
  });
});
