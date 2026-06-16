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

  function cacheKey(targetLanguage, text) {
    return `${targetLanguage || "ko"}:${stableHash(text)}`;
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
    trimCache
  });
});
