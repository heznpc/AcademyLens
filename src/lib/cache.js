(function initAcademyLensCache(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.AcademyLensCache = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function cacheFactory() {
  "use strict";

  function stableHash(value) {
    const text = String(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function normalizeScope(scope) {
    const options = scope || {};
    return {
      provider: String(options.provider || "default").replace(/[^A-Za-z0-9_.-]/g, "_"),
      glossarySignature: String(options.glossarySignature || "g0").replace(/[^A-Za-z0-9_.-]/g, "_"),
      correctionSignature: String(options.correctionSignature || "c0").replace(/[^A-Za-z0-9_.-]/g, "_")
    };
  }

  function cacheKey(targetLanguage, text, scope) {
    const normalized = normalizeScope(scope);
    return [
      targetLanguage || "ko",
      normalized.provider,
      normalized.glossarySignature,
      normalized.correctionSignature,
      stableHash(text)
    ].join(":");
  }

  function entryMatches(entry, text, targetLanguage, scope) {
    if (!entry || !entry.translated || entry.original !== text || entry.targetLanguage !== targetLanguage) {
      return false;
    }
    const normalized = normalizeScope(scope);
    return (
      (entry.provider || "default") === normalized.provider &&
      (entry.glossarySignature || "g0") === normalized.glossarySignature &&
      (entry.correctionSignature || "c0") === normalized.correctionSignature
    );
  }

  function trimCache(cache, maxEntries) {
    const limit = Number(maxEntries) || 600;
    const entries = Object.entries(cache || {});
    if (entries.length <= limit) return cache || {};

    return Object.fromEntries(
      entries
        .sort((a, b) => Number(b[1].accessedAt || b[1].createdAt || 0) - Number(a[1].accessedAt || a[1].createdAt || 0))
        .slice(0, limit)
    );
  }

  return Object.freeze({
    stableHash,
    cacheKey,
    entryMatches,
    normalizeScope,
    trimCache
  });
});
