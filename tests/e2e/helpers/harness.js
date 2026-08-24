const { test, expect } = require("@playwright/test");
const manifest = require("../../../manifest.json");
const { closeExtension, launchExtension } = require("./extension");
const { startFixtureServer, stopFixtureServer } = require("./fixture-server");
const panel = require("./panel");
const { registerTranslateStub } = require("./translate-stub");

async function translationCacheState(context) {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 5000 });
  return worker.evaluate(async () => {
    const stored = await chrome.storage.local.get([
      "academylens.translationCache.v1",
      "academylens.translationCacheEpoch.v1"
    ]);
    return {
      epoch: Number(stored["academylens.translationCacheEpoch.v1"]) || 0,
      size: Object.keys(stored["academylens.translationCache.v1"] || {}).length
    };
  });
}

async function translationCacheSize(context) {
  return (await translationCacheState(context)).size;
}

async function startHarness(options = {}) {
  const fixture = await startFixtureServer();
  const ext = await launchExtension({
    browserTranslatorStub: options.browserTranslatorStub,
    translationEngine: options.translationEngine
  });
  const calls = await registerTranslateStub(ext.context, options);
  const page = await ext.context.newPage();
  await page.goto(`${fixture.baseUrl}${options.path || "/course"}`);
  await panel.waitForPanel(page);
  return { calls, ext, fixture, page };
}

async function waitForFrame(page, pattern) {
  await expect.poll(() => page.frames().some((frame) => pattern.test(frame.url()))).toBe(true);
  return page.frames().find((frame) => pattern.test(frame.url()));
}

async function stopHarness(harness) {
  if (harness.ext) await closeExtension(harness.ext);
  if (harness.fixture) await stopFixtureServer(harness.fixture.server);
}

module.exports = {
  test,
  expect,
  manifest,
  closeExtension,
  launchExtension,
  startFixtureServer,
  stopFixtureServer,
  registerTranslateStub,
  translationCacheState,
  translationCacheSize,
  startHarness,
  waitForFrame,
  stopHarness,
  ...panel
};
