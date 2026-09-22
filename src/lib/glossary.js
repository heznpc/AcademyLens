(function initAcademyLensGlossary(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.AcademyLensGlossary = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function glossaryFactory() {
  "use strict";

  const PLACEHOLDER_PREFIX = "__AL_TERM_";
  const PLACEHOLDER_SUFFIX = "__";

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function uniqueTerms(terms) {
    return [...new Set((terms || []).map((term) => String(term).trim()).filter(Boolean))];
  }

  function sortTermsForMasking(terms) {
    return uniqueTerms(terms).sort((a, b) => b.length - a.length || a.localeCompare(b));
  }

  function termRegex(term, flags) {
    const source = escapeRegExp(term);
    return new RegExp(`(^|[^A-Za-z0-9_'’-])(${source})(?=$|[^A-Za-z0-9_'’-])`, flags);
  }

  function maskProtectedTerms(text, terms) {
    return maskTermValues(
      text,
      sortTermsForMasking(terms).map((term) => ({ source: term, value: term }))
    );
  }

  function maskTermValues(text, entries, existingPlaceholders) {
    return maskEntries(text, entries, existingPlaceholders, false);
  }

  function maskEntries(text, entries, existingPlaceholders, compiled) {
    let maskedText = String(text);
    const placeholders = existingPlaceholders ? existingPlaceholders.slice() : [];

    for (const entry of entries || []) {
      if (!entry || !entry.source || !entry.value) continue;
      const regex = compiled ? entry.regex : termRegex(entry.source, "gi");
      regex.lastIndex = 0;
      maskedText = maskedText.replace(regex, (match, prefix, value) => {
        const token = `${PLACEHOLDER_PREFIX}${placeholders.length}${PLACEHOLDER_SUFFIX}`;
        placeholders.push({ token, value: typeof entry.value === "function" ? entry.value(value) : entry.value });
        return `${prefix}${token}`;
      });
    }

    return { text: maskedText, placeholders };
  }

  function restoreProtectedTerms(text, placeholders) {
    return (placeholders || []).reduce(
      (nextText, placeholder) => nextText.split(placeholder.token).join(placeholder.value),
      String(text)
    );
  }

  function normalizeGlossary(glossary) {
    return {
      locale: glossary && glossary.locale ? glossary.locale : "ko",
      protectedTerms: uniqueTerms(glossary && glossary.protectedTerms),
      terms: Array.isArray(glossary && glossary.terms)
        ? glossary.terms
            .filter((entry) => entry && entry.source && entry.target)
            .map((entry) => ({
              source: String(entry.source),
              target: String(entry.target),
              category: entry.category ? String(entry.category) : "",
              sources: Array.isArray(entry.sources) ? entry.sources.map((source) => String(source)) : [],
              note: entry.note ? String(entry.note) : ""
            }))
        : []
    };
  }

  function createTranslationPreparer(glossary, targetLanguage) {
    const normalized = normalizeGlossary(glossary || {});
    const entries =
      targetLanguage === normalized.locale
        ? normalized.terms
            .sort((a, b) => b.source.length - a.source.length || a.source.localeCompare(b.source))
            .map((entry) => ({ source: entry.source, value: entry.target }))
        : [];

    for (const term of sortTermsForMasking(normalized.protectedTerms)) {
      entries.push({ source: term, value: term });
    }
    for (const entry of entries) {
      entry.regex = termRegex(entry.source, "gi");
    }

    // Keep compiled expressions within this pass; each call gets fresh placeholders.
    return (text) => maskEntries(text, entries, undefined, true);
  }

  function prepareForTranslation(text, glossary, targetLanguage) {
    return createTranslationPreparer(glossary, targetLanguage)(text);
  }

  return Object.freeze({
    escapeRegExp,
    uniqueTerms,
    sortTermsForMasking,
    maskProtectedTerms,
    maskTermValues,
    createTranslationPreparer,
    prepareForTranslation,
    restoreProtectedTerms,
    normalizeGlossary
  });
});
