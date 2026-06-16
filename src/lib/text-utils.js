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

  function shouldTranslateText(value, targetLanguage, maxLength) {
    const text = normalizeWhitespace(value);
    const limit = maxLength || 1200;

    if (targetLanguage === "en") return false;
    if (targetLanguage === "ko" && /[\u3131-\uD7A3]/.test(text)) return false;
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
        if (!shouldTranslateText(node.textContent, settings.targetLanguage, settings.maxTextLength)) {
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
