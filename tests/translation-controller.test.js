const assert = require("node:assert/strict");
const test = require("node:test");

const TranslationController = require("../src/content/translation-controller.js");

function wait(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("translation controller invalidates stale work and aborts the previous generation", async () => {
  let language = "ko";
  let pageUrl = "https://academy.openai.com/a";
  const controller = TranslationController.create({
    window: globalThis,
    isContextCurrent: (targetLanguage, url) => targetLanguage === language && url === pageUrl
  });

  const generation = controller.bumpGeneration();
  const signal = controller.currentAbortSignal(generation);
  const staleResult = controller.raceCurrent(new Promise(() => {}), generation, language, pageUrl);

  language = "ja";
  controller.bumpGeneration();

  assert.equal(await staleResult, undefined);
  assert.equal(signal.aborted, true);
  assert.equal(controller.isCurrent(generation, "ko", pageUrl), false);
});

test("translation controller coalesces pending requests and serializes active work", async () => {
  const runs = [];
  let active = 0;
  let maxActive = 0;
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const controller = TranslationController.create({
    window: globalThis,
    runTranslation: async (request) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      runs.push(request);
      if (runs.length === 1) await firstGate;
      active -= 1;
      return request.reason;
    }
  });

  const first = controller.enqueue({ reason: "first", targetLanguage: "ko" });
  const coalesced = controller.enqueue({ reason: "latest" });
  await wait(5);
  const queuedDuringRun = controller.enqueue({ reason: "next", targetLanguage: "ja" });
  releaseFirst();

  assert.equal(await first, "latest");
  assert.equal(await coalesced, "latest");
  assert.equal(await queuedDuringRun, "next");
  assert.equal(maxActive, 1);
  assert.deepEqual(runs, [
    { reason: "latest", targetLanguage: "ko" },
    { reason: "next", targetLanguage: "ja" }
  ]);
});

test("translation controller resolves canceled queued callers without running them", async () => {
  let runs = 0;
  const controller = TranslationController.create({
    window: globalThis,
    runTranslation: async () => {
      runs += 1;
    }
  });

  const pending = controller.enqueue({ reason: "auto" }, 50);
  controller.cancelQueued();

  assert.equal(await pending, undefined);
  assert.equal(runs, 0);
});

test("translation controller rejects failed callers and continues with the next queued work", async () => {
  let runs = 0;
  const controller = TranslationController.create({
    window: globalThis,
    runTranslation: async (request) => {
      runs += 1;
      if (request.reason === "broken") throw new Error("synthetic translation failure");
      return request.reason;
    }
  });

  const failed = controller.enqueue({ reason: "broken" });
  await assert.rejects(failed, /synthetic translation failure/);
  assert.equal(controller.active, false);

  const recovered = await controller.enqueue({ reason: "recovered" });
  assert.equal(recovered, "recovered");
  assert.equal(runs, 2);
});
