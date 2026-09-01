const { test, expect } = require("@playwright/test");
const {
  closeExtension,
  launchExtension,
  stopExtensionServiceWorker,
  waitForExtensionServiceWorker
} = require("./helpers/extension");

const GOOGLE_TRANSLATE_ORIGIN = "https://translate.googleapis.com/*";
const SETTINGS_KEY = "academylens.settings";
const CACHE_KEY = "academylens.translationCache.v1";
const CACHE_EPOCH_KEY = "academylens.translationCacheEpoch.v1";

test.describe("AcademyLens MV3 service worker E2E", () => {
  test("preserves local state and fails closed after the worker is restarted", async () => {
    const ext = await launchExtension({ freshInstall: true, locale: "en-US" });
    try {
      const initialWorker = await waitForExtensionServiceWorker(ext);
      const settings = {
        targetLanguage: "ko",
        autoTranslate: false,
        enableBrowserTranslatorDownloads: false,
        translationEngine: "remote",
        ollamaModel: "qwen3.5:4b"
      };
      const cache = {
        sentinel: {
          original: "Persist across a service worker restart",
          translated: "서비스 워커 재시작 후에도 유지",
          targetLanguage: "ko",
          provider: "google-translate",
          createdAt: 1,
          accessedAt: 1
        }
      };
      await initialWorker.evaluate(
        async ({ cache, cacheEpochKey, cacheKey, settings, settingsKey }) => {
          self.__academyLensWorkerSentinel = "before-stop";
          await chrome.storage.local.set({
            [settingsKey]: settings,
            [cacheKey]: cache,
            [cacheEpochKey]: 7
          });
        },
        { cache, cacheEpochKey: CACHE_EPOCH_KEY, cacheKey: CACHE_KEY, settings, settingsKey: SETTINGS_KEY }
      );

      const extensionPage = await ext.context.newPage();
      await extensionPage.goto(`chrome-extension://${ext.extensionId}/src/popup/popup.html`);
      await expect(extensionPage.locator("#translationEngine")).toHaveValue("remote");

      await stopExtensionServiceWorker(ext);

      const response = await extensionPage.evaluate(async () => {
        return chrome.runtime.sendMessage({
          type: "ACADEMYLENS_TRANSLATE_BATCH",
          operationId: "worker-restart-e2e",
          targetLanguage: "ko",
          translationEngine: "remote",
          texts: ["This request must not reach Google without permission."]
        });
      });
      const restartedWorker = await waitForExtensionServiceWorker(ext);

      expect(await restartedWorker.evaluate(() => self.__academyLensWorkerSentinel || null)).toBeNull();
      expect(response).toEqual({
        ok: false,
        translated: {},
        errors: {},
        error: "Remote translation permission not granted"
      });

      const restartedState = await restartedWorker.evaluate(
        async ({ cacheEpochKey, cacheKey, googleOrigin, settingsKey }) => {
          const stored = await chrome.storage.local.get([settingsKey, cacheKey, cacheEpochKey]);
          return {
            cache: stored[cacheKey],
            cacheEpoch: stored[cacheEpochKey],
            googleGranted: await chrome.permissions.contains({ origins: [googleOrigin] }),
            settings: stored[settingsKey]
          };
        },
        {
          cacheEpochKey: CACHE_EPOCH_KEY,
          cacheKey: CACHE_KEY,
          googleOrigin: GOOGLE_TRANSLATE_ORIGIN,
          settingsKey: SETTINGS_KEY
        }
      );
      expect(restartedState).toEqual({ cache, cacheEpoch: 7, googleGranted: false, settings });
    } finally {
      await closeExtension(ext);
    }
  });
});
