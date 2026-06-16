const assert = require("node:assert/strict");
const test = require("node:test");

const Cache = require("../src/lib/cache.js");

test("cacheKey is stable and language scoped", () => {
  const text = "OpenAI Academy courses help people build practical AI skills.";

  assert.equal(Cache.cacheKey("ko", text), Cache.cacheKey("ko", text));
  assert.notEqual(Cache.cacheKey("ko", text), Cache.cacheKey("ja", text));
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
