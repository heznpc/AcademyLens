// Manual Chrome-boundary QA. Run with:
//   node tests/e2e/optional-permission.manual.js
// Playwright cannot approve Chrome's browser-chrome extension permission dialog;
// this script automates every step around that one explicit learner decision.
const assert = require("node:assert/strict");
const { closeExtension, launchExtension } = require("./helpers/extension");

const GOOGLE_TRANSLATE_ORIGIN = "https://translate.googleapis.com/*";
const SETTINGS_KEY = "academylens.settings";
const TIMEOUT_MS = Number(process.env.ACADEMYLENS_PERMISSION_QA_TIMEOUT_MS) || 60_000;

async function readState(worker) {
  return worker.evaluate(
    async ({ origin, settingsKey }) => {
      const stored = await chrome.storage.local.get([settingsKey]);
      return {
        granted: await chrome.permissions.contains({ origins: [origin] }),
        settings: stored[settingsKey] || null
      };
    },
    { origin: GOOGLE_TRANSLATE_ORIGIN, settingsKey: SETTINGS_KEY }
  );
}

async function waitForGrant(worker) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const state = await readState(worker);
    if (state.granted) return state;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Google Translate permission was not approved before the manual QA timeout");
}

async function main() {
  const ext = await launchExtension({ freshInstall: true, locale: "en-US" });
  try {
    const initial = await readState(ext.serviceWorker);
    assert.equal(initial.granted, false, "fresh install must start without the Google host permission");

    const popup = await ext.context.newPage();
    await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/popup.html`);
    await popup.bringToFront();
    await popup.locator("#translationEngine").selectOption("remote");

    process.stdout.write("Approve the Google Translate permission in Chrome to complete this QA check.\n");
    const granted = await waitForGrant(ext.serviceWorker);
    assert.equal(granted.settings?.translationEngine, "remote");
    assert.equal(await popup.locator("#translationEngine").inputValue(), "remote");
    process.stdout.write("Optional-permission positive path passed.\n");
  } finally {
    await closeExtension(ext);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
