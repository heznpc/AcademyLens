const assert = require("node:assert/strict");
const test = require("node:test");

const Cache = require("../src/lib/cache.js");

test("cacheKey is stable and language scoped", () => {
  const text = "OpenAI Academy courses help people build practical AI skills.";

  assert.equal(Cache.cacheKey("ko", text), Cache.cacheKey("ko", text));
  assert.notEqual(Cache.cacheKey("ko", text), Cache.cacheKey("ja", text));
});

test("cacheKey and entryMatches include provider, glossary, and correction scope", () => {
  const text = "Provider scoped lesson";
  const google = {
    provider: "google-translate",
    glossarySignature: "g-a",
    correctionSignature: "c-a"
  };
  const native = {
    provider: "browser-translator",
    glossarySignature: "g-a",
    correctionSignature: "c-a"
  };
  const key = Cache.cacheKey("ko", text, google);
  const entry = {
    original: text,
    translated: "번역",
    targetLanguage: "ko",
    ...Cache.normalizeScope(google)
  };

  assert.notEqual(key, Cache.cacheKey("ko", text, native));
  assert.equal(Cache.entryMatches(entry, text, "ko", google), true);
  assert.equal(Cache.entryMatches(entry, text, "ko", native), false);
});

test("trimCache keeps the newest entries", () => {
  const cache = {
    old: { createdAt: 1, translated: "old" },
    new: { createdAt: 3, translated: "new" },
    middle: { createdAt: 2, translated: "middle" },
    recentlyUsed: { createdAt: 0, accessedAt: 4, translated: "recently used" }
  };

  assert.deepEqual(Object.keys(Cache.trimCache(cache, 2)), ["recentlyUsed", "new"]);
});
