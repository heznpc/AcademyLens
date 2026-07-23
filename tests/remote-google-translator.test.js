const assert = require("node:assert/strict");
const test = require("node:test");

const Cache = require("../src/lib/cache.js");
const GoogleTranslate = require("../src/lib/google-translate.js");
const RemoteGoogleTranslator = require("../src/lib/remote-google-translator.js");

function response(status, translated) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return [[translated ? [translated, "", null, null] : []]];
    }
  };
}

test("remote Google translator retries retryable failures", async () => {
  let calls = 0;
  const translator = RemoteGoogleTranslator.create({
    Cache,
    GoogleTranslate,
    maxRetries: 1,
    baseBackoffMs: 1,
    random: () => 0,
    async fetchImpl() {
      calls += 1;
      return calls === 1 ? response(503) : response(200, "AI 기초");
    }
  });

  const result = await translator.translateText("AI Foundations", "ko", { provider: "google-translate" });

  assert.equal(result, "AI 기초");
  assert.equal(calls, 2);
});

test("remote Google translator dedupes requests by cache scope", async () => {
  let calls = 0;
  let release;
  const blocker = new Promise((resolve) => {
    release = resolve;
  });
  const translator = RemoteGoogleTranslator.create({
    Cache,
    GoogleTranslate,
    async fetchImpl(url) {
      calls += 1;
      await blocker;
      const text = new URL(url).searchParams.get("q");
      return response(200, `translated: ${text}`);
    }
  });

  const scope = { provider: "google-translate", glossarySignature: "g-a", correctionSignature: "c-a" };
  const first = translator.translateText("Shared text", "ko", scope);
  const second = translator.translateText("Shared text", "ko", scope);
  release();

  assert.deepEqual(await Promise.all([first, second]), ["translated: Shared text", "translated: Shared text"]);
  assert.equal(calls, 1);

  await translator.translateText("Shared text", "ko", { ...scope, glossarySignature: "g-b" });
  assert.equal(calls, 2);
});

test("remote Google translator limits concurrent fetches", async () => {
  let active = 0;
  let maxActive = 0;
  const translator = RemoteGoogleTranslator.create({
    Cache,
    GoogleTranslate,
    maxConcurrent: 2,
    async fetchImpl(url) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      const text = new URL(url).searchParams.get("q");
      return response(200, `translated: ${text}`);
    }
  });

  await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      translator.translateText(`Text ${index}`, "ko", { provider: "google-translate" })
    )
  );

  assert(maxActive <= 2, `expected max concurrency <= 2, got ${maxActive}`);
});
