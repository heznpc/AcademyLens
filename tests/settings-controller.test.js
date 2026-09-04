const assert = require("node:assert/strict");
const test = require("node:test");

const Constants = require("../src/lib/constants.js");
const SettingsController = require("../src/content/settings-controller.js");

function harness(storedSettings = {}) {
  const storage = { [Constants.STORAGE_KEYS.SETTINGS]: storedSettings };
  const listeners = new Set();
  const chrome = {
    storage: {
      local: {
        async get() {
          return { ...storage };
        },
        async set(values) {
          Object.assign(storage, values);
        }
      },
      onChanged: {
        addListener(listener) {
          listeners.add(listener);
        },
        removeListener(listener) {
          listeners.delete(listener);
        }
      }
    }
  };
  const controller = SettingsController.create({
    chrome,
    constants: Constants,
    navigator: { language: "ko-KR", languages: ["ko-KR", "en-US"] }
  });
  return { controller, listeners, storage };
}

test("settings controller resolves and persists safe first-run defaults", async () => {
  const { controller, storage } = harness();
  const settings = await controller.load();
  assert.equal(settings.targetLanguage, "ko");
  assert.equal(settings.translationEngine, "device");
  assert.equal(storage[Constants.STORAGE_KEYS.SETTINGS].ollamaModel, "qwen3.5:4b");
});

test("settings controller migrates a stored auto engine to device-only", async () => {
  const { controller, storage } = harness({
    targetLanguage: "ja",
    translationEngine: "auto",
    ollamaModel: "gemma3:4b"
  });

  const settings = await controller.load();

  assert.equal(settings.translationEngine, "device");
  assert.equal(storage[Constants.STORAGE_KEYS.SETTINGS].translationEngine, "device");
  assert.equal(storage[Constants.STORAGE_KEYS.SETTINGS].targetLanguage, "ja");
  assert.equal(storage[Constants.STORAGE_KEYS.SETTINGS].ollamaModel, "gemma3:4b");
});

test("settings controller normalizes aliases and replaces unsupported target languages", async () => {
  const aliased = harness({ targetLanguage: "he", translationEngine: "device" });
  assert.equal((await aliased.controller.load()).targetLanguage, "iw");
  assert.equal(aliased.storage[Constants.STORAGE_KEYS.SETTINGS].targetLanguage, "iw");

  const unsupported = harness({ targetLanguage: "xx-invalid", translationEngine: "device" });
  assert.equal((await unsupported.controller.load()).targetLanguage, "ko");
  assert.equal(unsupported.storage[Constants.STORAGE_KEYS.SETTINGS].targetLanguage, "ko");
});

test("settings controller owns storage listener lifecycle and normalizes changes", () => {
  const { controller, listeners } = harness();
  let nextSettings;
  controller.start({ onSettings: (value) => (nextSettings = value) });
  assert.equal(listeners.size, 1);
  [...listeners][0]({ [Constants.STORAGE_KEYS.SETTINGS]: { newValue: { translationEngine: "invalid" } } }, "local");
  assert.equal(nextSettings.translationEngine, "device");
  controller.stop();
  assert.equal(listeners.size, 0);
});
