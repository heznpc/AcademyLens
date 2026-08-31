const { test, expect } = require("@playwright/test");
const { closeExtension, launchExtension } = require("./helpers/extension");
const { startFixtureServer, stopFixtureServer } = require("./helpers/fixture-server");
const { clickPanelButton, waitForPanel } = require("./helpers/panel");

const GOOGLE_TRANSLATE_ORIGIN = "https://translate.googleapis.com/*";
const GOOGLE_TRANSLATE_URL = "https://translate.googleapis.com/";
const OLLAMA_ORIGIN = "http://localhost:11434/*";
const SETTINGS_KEY = "academylens.settings";
const SENTINEL_TEXT = "A singular green comet passes above the valley at dawn.";

async function extensionState(ext) {
  const serviceWorker = ext.serviceWorker || (await ext.context.waitForEvent("serviceworker", { timeout: 5000 }));
  return serviceWorker.evaluate(
    async ({ googleOrigin, ollamaOrigin, settingsKey }) => {
      const manifest = chrome.runtime.getManifest();
      const stored = await chrome.storage.local.get([settingsKey]);
      const grantedPermissions = await chrome.permissions.getAll();
      return {
        googleGranted: await chrome.permissions.contains({ origins: [googleOrigin] }),
        ollamaGranted: await chrome.permissions.contains({ origins: [ollamaOrigin] }),
        grantedOrigins: grantedPermissions.origins || [],
        hasStoredSettings: Object.prototype.hasOwnProperty.call(stored, settingsKey),
        hostPermissions: manifest.host_permissions || [],
        optionalHostPermissions: manifest.optional_host_permissions || [],
        settings: stored[settingsKey] || null
      };
    },
    { googleOrigin: GOOGLE_TRANSLATE_ORIGIN, ollamaOrigin: OLLAMA_ORIGIN, settingsKey: SETTINGS_KEY }
  );
}

test.describe("AcademyLens fresh install E2E", () => {
  test("keeps remote providers optional and does not preseed target settings", async () => {
    const ext = await launchExtension({ freshInstall: true, locale: "en-US" });
    try {
      const initial = await extensionState(ext);
      expect(initial.googleGranted).toBe(false);
      expect(initial.ollamaGranted).toBe(false);
      expect(initial.grantedOrigins).not.toContain(GOOGLE_TRANSLATE_ORIGIN);
      expect(initial.grantedOrigins).not.toContain(OLLAMA_ORIGIN);
      expect(initial.hasStoredSettings).toBe(false);
      expect(initial.hostPermissions).not.toContain(GOOGLE_TRANSLATE_ORIGIN);
      expect(initial.hostPermissions).not.toContain(OLLAMA_ORIGIN);
      expect(initial.optionalHostPermissions).toContain(GOOGLE_TRANSLATE_ORIGIN);
      expect(initial.optionalHostPermissions).toContain(OLLAMA_ORIGIN);

      const popup = await ext.context.newPage();
      await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/popup.html`);
      await expect(popup.locator("#targetLanguage")).toHaveValue("");
      await expect(popup.locator("#translationEngine")).toHaveValue("device");

      await expect
        .poll(async () => {
          const current = await extensionState(ext);
          return current.settings && current.settings.targetLanguage;
        })
        .toBe("");
      await popup.close();
    } finally {
      await closeExtension(ext);
    }
  });

  test("does not request Google when remote settings exist without permission", async () => {
    const fixture = await startFixtureServer();
    const ext = await launchExtension({ freshInstall: true, locale: "en-US" });
    try {
      const initial = await extensionState(ext);
      expect(initial.googleGranted).toBe(false);
      expect(initial.hasStoredSettings).toBe(false);

      const serviceWorker = ext.serviceWorker || (await ext.context.waitForEvent("serviceworker", { timeout: 5000 }));
      await serviceWorker.evaluate(async (settingsKey) => {
        await chrome.storage.local.set({
          [settingsKey]: {
            targetLanguage: "ko",
            autoTranslate: false,
            enableBrowserTranslatorDownloads: false,
            translationEngine: "remote",
            ollamaModel: "qwen3.5:4b"
          }
        });
      }, SETTINGS_KEY);

      const googleAttempts = new Set();
      ext.context.on("request", (request) => {
        if (request.url().startsWith(GOOGLE_TRANSLATE_URL)) googleAttempts.add(request.url());
      });
      await ext.context.route(`${GOOGLE_TRANSLATE_URL}**`, async (route) => {
        googleAttempts.add(route.request().url());
        await route.abort("blockedbyclient");
      });

      const page = await ext.context.newPage();
      await page.goto(`${fixture.baseUrl}/course`);
      await waitForPanel(page);
      await page.locator("#lesson-main").evaluate((main, sentinelText) => {
        main.innerHTML = `<p id="permission-sentinel">${sentinelText}</p>`;
      }, SENTINEL_TEXT);

      await clickPanelButton(page, "[data-translate]");
      await expect
        .poll(() =>
          page.evaluate(() => {
            const shadow = document.querySelector(".academylens-root")?.shadowRoot;
            const panel = shadow?.querySelector(".panel");
            const status = shadow?.querySelector("[data-status]");
            return {
              busy: panel?.dataset.busy,
              tone: status?.dataset.tone
            };
          })
        )
        .toEqual({ busy: "false", tone: "error" });

      expect([...googleAttempts]).toEqual([]);
      await expect(page.locator("#permission-sentinel")).toHaveText(SENTINEL_TEXT);
      expect((await extensionState(ext)).googleGranted).toBe(false);
    } finally {
      await closeExtension(ext);
      await stopFixtureServer(fixture.server);
    }
  });
});
