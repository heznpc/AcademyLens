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
    return new RegExp(`(^|[^A-Za-z0-9_])(${source})(?=$|[^A-Za-z0-9_])`, flags);
  }

  function maskProtectedTerms(text, terms) {
    return maskTermValues(
      text,
      sortTermsForMasking(terms).map((term) => ({ source: term, value: term }))
    );
  }

  function maskTermValues(text, entries, existingPlaceholders) {
    let maskedText = String(text);
    const placeholders = existingPlaceholders ? existingPlaceholders.slice() : [];

    for (const entry of entries || []) {
      if (!entry || !entry.source || !entry.value) continue;
      const regex = termRegex(entry.source, "gi");
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
              note: entry.note ? String(entry.note) : ""
            }))
        : []
    };
  }

  function prepareForTranslation(text, glossary, targetLanguage) {
    const normalized = normalizeGlossary(glossary || {});
    const protectedResult = maskProtectedTerms(text, normalized.protectedTerms);

    if (targetLanguage !== normalized.locale || normalized.terms.length === 0) {
      return protectedResult;
    }

    const termEntries = normalized.terms
      .slice()
      .sort((a, b) => b.source.length - a.source.length || a.source.localeCompare(b.source))
      .map((entry) => ({ source: entry.source, value: entry.target }));

    return maskTermValues(protectedResult.text, termEntries, protectedResult.placeholders);
  }

  return Object.freeze({
    escapeRegExp,
    uniqueTerms,
    sortTermsForMasking,
    maskProtectedTerms,
    maskTermValues,
    prepareForTranslation,
    restoreProtectedTerms,
    normalizeGlossary
  });
});
