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

test("canceling one deduplicated caller does not abort another caller", async () => {
  let calls = 0;
  let fetchAborted = false;
  let release;
  let markFetchStarted;
  const blocker = new Promise((resolve) => {
    release = resolve;
  });
  const fetchStarted = new Promise((resolve) => {
    markFetchStarted = resolve;
  });
  const translator = RemoteGoogleTranslator.create({
    Cache,
    GoogleTranslate,
    async fetchImpl(_url, requestOptions) {
      calls += 1;
      requestOptions.signal.addEventListener("abort", () => {
        fetchAborted = true;
      });
      markFetchStarted();
      await blocker;
      return response(200, "공유 번역");
    }
  });
  const scope = { provider: "google-translate", glossarySignature: "shared", correctionSignature: "shared" };
  const firstController = new AbortController();
  const secondController = new AbortController();

  const first = translator.translateText("Shared cancellation text", "ko", scope, firstController.signal);
  await fetchStarted;
  const second = translator.translateText("Shared cancellation text", "ko", scope, secondController.signal);
  firstController.abort();

  await assert.rejects(first, isAbortError);
  assert.equal(fetchAborted, false, "the shared fetch must remain active for the second caller");
  release();
  assert.equal(await second, "공유 번역");
  assert.equal(calls, 1);
  assert.equal(fetchAborted, false);
});

test("aborts the underlying shared fetch exactly once when every caller cancels", async () => {
  let calls = 0;
  let underlyingAborts = 0;
  let markFetchStarted;
  const fetchStarted = new Promise((resolve) => {
    markFetchStarted = resolve;
  });
  const translator = RemoteGoogleTranslator.create({
    Cache,
    GoogleTranslate,
    maxRetries: 0,
    async fetchImpl(_url, requestOptions) {
      calls += 1;
      markFetchStarted();
      return new Promise((_resolve, reject) => {
        requestOptions.signal.addEventListener(
          "abort",
          () => {
            underlyingAborts += 1;
            const error = new Error("shared fetch aborted");
            error.name = "AbortError";
            reject(error);
          },
          { once: true }
        );
      });
    }
  });
  const firstController = new AbortController();
  const secondController = new AbortController();
  const first = translator.translateText("Every caller cancels", "ko", SCOPE, firstController.signal);
  const second = translator.translateText("Every caller cancels", "ko", SCOPE, secondController.signal);
  const firstRejected = assert.rejects(first, isAbortError);
  const secondRejected = assert.rejects(second, isAbortError);

  await fetchStarted;
  firstController.abort();
  await firstRejected;
  assert.equal(underlyingAborts, 0, "one remaining caller must keep the shared fetch alive");

  secondController.abort();
  await secondRejected;
  assert.equal(calls, 1);
  assert.equal(underlyingAborts, 1);
});

test("a third caller joins the existing request after one shared caller cancels", async () => {
  let calls = 0;
  let release;
  let markFetchStarted;
  const blocker = new Promise((resolve) => {
    release = resolve;
  });
  const fetchStarted = new Promise((resolve) => {
    markFetchStarted = resolve;
  });
  const translator = RemoteGoogleTranslator.create({
    Cache,
    GoogleTranslate,
    async fetchImpl() {
      calls += 1;
      markFetchStarted();
      await blocker;
      return response(200, "기존 공유 번역");
    }
  });
  const firstController = new AbortController();
  const secondController = new AbortController();
  const first = translator.translateText("Join an active request", "ko", SCOPE, firstController.signal);
  const second = translator.translateText("Join an active request", "ko", SCOPE, secondController.signal);
  const firstRejected = assert.rejects(first, isAbortError);

  await fetchStarted;
  firstController.abort();
  await firstRejected;
  const third = translator.translateText("Join an active request", "ko", SCOPE);
  release();

  assert.deepEqual(await Promise.all([second, third]), ["기존 공유 번역", "기존 공유 번역"]);
  assert.equal(calls, 1, "the third caller must subscribe instead of starting another fetch");
});

test("a shared failure is evicted so the same key can fetch again", async () => {
  let calls = 0;
  const translator = RemoteGoogleTranslator.create({
    Cache,
    GoogleTranslate,
    maxRetries: 0,
    async fetchImpl() {
      calls += 1;
      if (calls === 1) return response(500);
      return response(200, "재시도 번역");
    }
  });

  const first = translator.translateText("Retry after shared failure", "ko", SCOPE);
  const second = translator.translateText("Retry after shared failure", "ko", SCOPE);
  await Promise.all([
    assert.rejects(first, /Google Translate request failed with 500/),
    assert.rejects(second, /Google Translate request failed with 500/)
  ]);

  assert.equal(await translator.translateText("Retry after shared failure", "ko", SCOPE), "재시도 번역");
  assert.equal(calls, 2);
});

test("never fetches a queued shared request when all of its callers cancel", async () => {
  let calls = 0;
  let releaseRunning;
  let markRunningFetchStarted;
  const runningBlocker = new Promise((resolve) => {
    releaseRunning = resolve;
  });
  const runningFetchStarted = new Promise((resolve) => {
    markRunningFetchStarted = resolve;
  });
  const translator = RemoteGoogleTranslator.create({
    Cache,
    GoogleTranslate,
    maxConcurrent: 1,
    async fetchImpl(url) {
      calls += 1;
      const text = new URL(url).searchParams.get("q");
      if (text === "Occupy the only slot") {
        markRunningFetchStarted();
        await runningBlocker;
      }
      return response(200, `translated: ${text}`);
    }
  });
  const running = translator.translateText("Occupy the only slot", "ko", SCOPE);
  await runningFetchStarted;

  const firstController = new AbortController();
  const secondController = new AbortController();
  const firstQueued = translator.translateText("Queued shared request", "ko", SCOPE, firstController.signal);
  const secondQueued = translator.translateText("Queued shared request", "ko", SCOPE, secondController.signal);
  const firstRejected = assert.rejects(firstQueued, isAbortError);
  const secondRejected = assert.rejects(secondQueued, isAbortError);

  firstController.abort();
  secondController.abort();
  await Promise.all([firstRejected, secondRejected]);
  assert.equal(calls, 1, "the shared queued request must not start while the slot is occupied");

  releaseRunning();
  await running;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 1, "the canceled queued request must have been removed from the fetch queue");
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

const SCOPE = { provider: "google-translate" };

function isAbortError(error) {
  return error && error.name === "AbortError";
}

test("remote translator rejects immediately when the signal is already aborted", async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const translator = RemoteGoogleTranslator.create({
    Cache,
    GoogleTranslate,
    async fetchImpl() {
      calls += 1;
      return response(200, "AI 기초");
    }
  });

  await assert.rejects(() => translator.translateText("AI Foundations", "ko", SCOPE, controller.signal), isAbortError);
  assert.equal(calls, 0);
});

test("remote translator drops a queued request when its signal aborts before it runs", async () => {
  let calls = 0;
  let release;
  const blocker = new Promise((resolve) => {
    release = resolve;
  });
  let markFetchStarted;
  const fetchStarted = new Promise((resolve) => {
    markFetchStarted = resolve;
  });
  const translator = RemoteGoogleTranslator.create({
    Cache,
    GoogleTranslate,
    maxConcurrent: 1,
    async fetchImpl(url) {
      calls += 1;
      markFetchStarted();
      await blocker;
      const text = new URL(url).searchParams.get("q");
      return response(200, `translated: ${text}`);
    }
  });

  const first = translator.translateText("First", "ko", SCOPE);
  const controller = new AbortController();
  const second = translator.translateText("Second", "ko", SCOPE, controller.signal);

  // Deterministically wait until the first request occupies the only slot, so the
  // second is provably queued (not merely fetched slowly) before we abort it.
  await fetchStarted;
  assert.equal(calls, 1, "only the running request should have fetched");

  controller.abort();
  await assert.rejects(second, isAbortError);
  assert.equal(calls, 1, "aborted queued request must never fetch");

  release();
  await first;
  assert.equal(calls, 1);
});

test("remote translator stops retrying when aborted during backoff", async () => {
  let calls = 0;
  let enterSleep;
  const sleeping = new Promise((resolve) => {
    enterSleep = resolve;
  });
  const controller = new AbortController();
  const translator = RemoteGoogleTranslator.create({
    Cache,
    GoogleTranslate,
    maxRetries: 3,
    baseBackoffMs: 350,
    timeoutMs: 8000,
    random: () => 0,
    setTimeoutImpl(callback, ms) {
      if (ms === 350) enterSleep();
      return { callback, ms };
    },
    clearTimeoutImpl() {},
    async fetchImpl() {
      calls += 1;
      return response(503);
    }
  });

  const pending = translator.translateText("AI Foundations", "ko", SCOPE, controller.signal);
  await sleeping;
  controller.abort();

  await assert.rejects(pending, isAbortError);
  assert.equal(calls, 1, "no retry fetch should fire after abort during backoff");
});

test("remote translator forwards the outer abort to the in-flight fetch", async () => {
  // Pins the per-attempt AbortController wiring: the fetch only rejects because the
  // outer signal's abort is forwarded to requestOptions.signal.
  let calls = 0;
  let markFetchStarted;
  const fetchStarted = new Promise((resolve) => {
    markFetchStarted = resolve;
  });
  const controller = new AbortController();
  const translator = RemoteGoogleTranslator.create({
    Cache,
    GoogleTranslate,
    maxRetries: 2,
    baseBackoffMs: 1,
    random: () => 0,
    async fetchImpl(url, requestOptions) {
      calls += 1;
      markFetchStarted();
      return new Promise((resolve, reject) => {
        requestOptions.signal.addEventListener("abort", () => {
          const error = new Error("fetch aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }
  });

  const pending = translator.translateText("AI Foundations", "ko", SCOPE, controller.signal);
  await fetchStarted;
  controller.abort();

  await assert.rejects(pending, isAbortError);
  assert.equal(calls, 1);
});

test("remote translator reports an abort as AbortError even on the final attempt", async () => {
  // Pins the in-catch short-circuit: when the outer signal is aborted, a fetch that
  // rejects with a non-abort error on the last attempt must still surface AbortError
  // rather than the underlying network error.
  let calls = 0;
  const controller = new AbortController();
  const translator = RemoteGoogleTranslator.create({
    Cache,
    GoogleTranslate,
    maxRetries: 0,
    baseBackoffMs: 1,
    random: () => 0,
    async fetchImpl() {
      calls += 1;
      controller.abort();
      const error = new Error("network glitch");
      error.name = "TypeError";
      throw error;
    }
  });

  await assert.rejects(() => translator.translateText("AI Foundations", "ko", SCOPE, controller.signal), isAbortError);
  assert.equal(calls, 1);
});

test("remote translator does not retry a non-retryable status", async () => {
  let calls = 0;
  const translator = RemoteGoogleTranslator.create({
    Cache,
    GoogleTranslate,
    maxRetries: 3,
    baseBackoffMs: 1,
    random: () => 0,
    async fetchImpl() {
      calls += 1;
      return response(400);
    }
  });

  await assert.rejects(() => translator.translateText("AI Foundations", "ko", SCOPE), /400/);
  assert.equal(calls, 1, "a 400 must not be retried");
});

test("remote translator retries after a per-attempt fetch timeout", async () => {
  let calls = 0;
  const translator = RemoteGoogleTranslator.create({
    Cache,
    GoogleTranslate,
    timeoutMs: 10,
    baseBackoffMs: 1,
    maxRetries: 2,
    random: () => 0,
    async fetchImpl(url, requestOptions) {
      calls += 1;
      if (calls === 1) {
        return new Promise((resolve, reject) => {
          requestOptions.signal.addEventListener("abort", () => {
            const error = new Error("timed out");
            error.name = "AbortError";
            reject(error);
          });
        });
      }
      const text = new URL(url).searchParams.get("q");
      return response(200, `translated: ${text}`);
    }
  });

  const result = await translator.translateText("AI Foundations", "ko", SCOPE);
  assert.equal(result, "translated: AI Foundations");
  assert.equal(calls, 2, "a timed-out attempt should be retried, not treated as a user abort");
});
