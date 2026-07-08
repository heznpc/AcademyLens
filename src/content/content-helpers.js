(function initAcademyLensContentHelpers(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.AcademyLensContentHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function contentHelpersFactory() {
  "use strict";

  function cacheEpochValue(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }

  function chunks(values, size) {
    const result = [];
    for (let index = 0; index < values.length; index += size) {
      result.push(values.slice(index, index + size));
    }
    return result;
  }

  function stableHash(Cache, value) {
    return Cache && typeof Cache.stableHash === "function" ? Cache.stableHash(value) : "h0";
  }

  function glossarySignature(Cache, glossary) {
    if (!glossary) return "g0";
    const parts = [
      glossary.locale || "unknown",
      (glossary.protectedTerms || []).length,
      (glossary.terms || []).length,
      stableHash(
        Cache,
        (glossary.terms || []).map((entry) => `${entry.source}->${entry.target}`).join("|") +
          "|" +
          (glossary.protectedTerms || []).join("|")
      )
    ];
    return `g-${parts.join("-")}`;
  }

  function correctionSignature(Cache, corrections) {
    const entries = Object.entries(corrections || {}).sort(([a], [b]) => a.localeCompare(b));
    if (!entries.length) return "c0";
    const payload = entries
      .map(([key, value]) => `${key}:${value.targetLanguage}:${value.original}:${value.translated}`)
      .join("|");
    return `c-${entries.length}-${stableHash(Cache, payload)}`;
  }

  function cacheScope(Cache, provider, glossary, corrections) {
    return {
      provider,
      glossarySignature: glossarySignature(Cache, glossary),
      correctionSignature: correctionSignature(Cache, corrections)
    };
  }

  function cacheHasTranslation(Cache, cache, key, text, targetLanguage, scope) {
    return Cache && typeof Cache.entryMatches === "function"
      ? Cache.entryMatches(cache[key], text, targetLanguage, scope)
      : Boolean(
          cache[key] &&
          cache[key].translated &&
          cache[key].original === text &&
          cache[key].targetLanguage === targetLanguage
        );
  }

  function cacheUpdateMeta(Cache, scope) {
    return Cache && typeof Cache.normalizeScope === "function" ? Cache.normalizeScope(scope) : {};
  }

  function correctionKey(Text, targetLanguage, text) {
    return `${targetLanguage}:${Text.stableHash(Text.normalizeWhitespace(text))}`;
  }

  function correctionFor(Text, corrections, targetLanguage, text) {
    const normalized = Text.normalizeWhitespace(text);
    const correction = corrections[correctionKey(Text, targetLanguage, normalized)];
    if (!correction || correction.original !== normalized || correction.targetLanguage !== targetLanguage) return "";
    return correction.translated || "";
  }

  function correctionEntries(corrections) {
    return Object.entries(corrections || {}).sort((a, b) => {
      const left = a[1] || {};
      const right = b[1] || {};
      return (
        String(left.targetLanguage || "").localeCompare(String(right.targetLanguage || "")) ||
        String(left.original || "").localeCompare(String(right.original || ""))
      );
    });
  }

  function untranslatedTexts(texts, response) {
    const translated = (response && response.translated) || {};
    return (texts || []).filter((text) => !translated[text]);
  }

  function placeholderTokens(value) {
    return new Set(String(value || "").match(/__AL_(?:TERM|INLINE)_\d+__/g) || []);
  }

  function hasUnexpectedPlaceholderTokens(original, translated) {
    const sourceTokens = placeholderTokens(original);
    const resultTokens = placeholderTokens(translated);
    if (sourceTokens.size === 0) return resultTokens.size > 0;
    if (resultTokens.size === 0) return true;
    return Array.from(resultTokens).some((token) => !sourceTokens.has(token));
  }

  function translationLooksSuspicious(Text, original, translated, targetLanguage) {
    const source = Text.normalizeWhitespace(original || "");
    const result = Text.normalizeWhitespace(translated || "");
    if (!result) return true;
    if (targetLanguage !== "en" && result === source && Text.hasLatinLetters(source)) return true;
    if (hasUnexpectedPlaceholderTokens(source, result)) return true;
    return false;
  }

  function mergeTranslationResponses(primary, secondary, requestedTexts) {
    const translated = {
      ...((primary && primary.translated) || {}),
      ...((secondary && secondary.translated) || {})
    };
    const errors = {
      ...((primary && primary.errors) || {})
    };
    for (const text of Object.keys((secondary && secondary.translated) || {})) {
      delete errors[text];
    }
    Object.assign(errors, (secondary && secondary.errors) || {});

    return {
      ok: Object.keys(translated).length > 0 || (requestedTexts || []).length === 0,
      translated,
      errors,
      stats: {
        ...((primary && primary.stats) || {}),
        fallback: (secondary && secondary.stats) || null,
        requested: (requestedTexts || []).length,
        failed: Object.keys(errors).length
      }
    };
  }

  function nodeTextType(NodeRef) {
    return NodeRef && typeof NodeRef.TEXT_NODE === "number" ? NodeRef.TEXT_NODE : 3;
  }

  function candidateElement(NodeRef, candidate) {
    const target = candidate && candidate.target;
    return target && target.nodeType === nodeTextType(NodeRef) ? target.parentElement : target;
  }

  function candidateContextKey(NodeRef, candidate) {
    const element = candidateElement(NodeRef, candidate);
    const context = element?.closest?.("[data-testid], article, section, main") || element?.parentElement || element;
    if (!context) return "page";
    return [
      context.tagName || "node",
      context.id || "",
      context.getAttribute?.("data-testid") || "",
      context.getAttribute?.("aria-label") || ""
    ].join(":");
  }

  function appendContextText(NodeRef, groups, seen, candidate, text) {
    if (!text || seen.has(text)) return;
    seen.add(text);
    const key = candidateContextKey(NodeRef, candidate);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(text);
  }

  function orderedContextTexts(groups) {
    return Array.from(groups.values()).flat();
  }

  function mergeDiagnostics(target, source) {
    if (!source) return target;
    target.cacheHits += source.cacheHits || 0;
    target.cacheMisses += source.cacheMisses || 0;
    target.fallbackTexts += source.fallbackTexts || 0;
    target.corrections += source.corrections || 0;
    target.contextGroups += source.contextGroups || 0;
    target.frames += source.frames || 0;
    target.frameApplied += source.frameApplied || 0;
    target.frameFailed += source.frameFailed || 0;
    if (source.provider) target.provider = source.provider;
    return target;
  }

  function diagnosticsFromResponse(response, requestedCount, providerMode) {
    const stats = (response && response.stats) || {};
    const fallbackStats = stats.fallback || null;
    return {
      cacheHits: stats.cacheHits || 0,
      cacheMisses: stats.cacheMisses || 0,
      fallbackTexts: fallbackStats
        ? fallbackStats.requested || requestedCount || 0
        : stats.fallback
          ? requestedCount || 0
          : 0,
      corrections: 0,
      contextGroups: 0,
      frames: 0,
      frameApplied: 0,
      frameFailed: 0,
      provider: stats.provider || (fallbackStats ? "mixed" : providerMode)
    };
  }

  function create(options = {}) {
    const Cache = options.Cache;
    const Text = options.Text;
    const NodeRef = options.Node || (typeof Node !== "undefined" ? Node : null);

    return Object.freeze({
      cacheEpochValue,
      chunks,
      glossarySignature: (glossary) => glossarySignature(Cache, glossary),
      correctionSignature: (corrections) => correctionSignature(Cache, corrections),
      cacheScope: (provider, glossary, corrections) => cacheScope(Cache, provider, glossary, corrections),
      cacheHasTranslation: (cache, key, text, targetLanguage, scope) =>
        cacheHasTranslation(Cache, cache, key, text, targetLanguage, scope),
      cacheUpdateMeta: (scope) => cacheUpdateMeta(Cache, scope),
      correctionKey: (targetLanguage, text) => correctionKey(Text, targetLanguage, text),
      correctionFor: (corrections, targetLanguage, text) => correctionFor(Text, corrections, targetLanguage, text),
      correctionEntries,
      untranslatedTexts,
      hasUnexpectedPlaceholderTokens,
      translationLooksSuspicious: (original, translated, targetLanguage) =>
        translationLooksSuspicious(Text, original, translated, targetLanguage),
      mergeTranslationResponses,
      candidateElement: (candidate) => candidateElement(NodeRef, candidate),
      candidateContextKey: (candidate) => candidateContextKey(NodeRef, candidate),
      appendContextText: (groups, seen, candidate, text) => appendContextText(NodeRef, groups, seen, candidate, text),
      orderedContextTexts,
      mergeDiagnostics,
      diagnosticsFromResponse: (response, requestedCount, providerMode) =>
        diagnosticsFromResponse(response, requestedCount, providerMode)
    });
  }

  return Object.freeze({
    cacheEpochValue,
    chunks,
    glossarySignature,
    correctionSignature,
    cacheScope,
    cacheHasTranslation,
    cacheUpdateMeta,
    correctionKey,
    correctionFor,
    correctionEntries,
    untranslatedTexts,
    hasUnexpectedPlaceholderTokens,
    translationLooksSuspicious,
    mergeTranslationResponses,
    candidateElement,
    candidateContextKey,
    appendContextText,
    orderedContextTexts,
    mergeDiagnostics,
    diagnosticsFromResponse,
    create
  });
});
