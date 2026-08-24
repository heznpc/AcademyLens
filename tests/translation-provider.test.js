const assert = require("node:assert/strict");
const test = require("node:test");

const Constants = require("../src/lib/constants.js");
const TranslationProvider = require("../src/content/translation-provider.js");

function createProvider(settings, send) {
  return TranslationProvider.create({
    constants: Constants,
    Cache: {},
    BrowserTranslator: {
      PROVIDER_ID: "browser-translator",
      async availability() {
        return { status: "unavailable" };
      },
      async translateBatch() {
        return {};
      }
    },
    GoogleTranslate: {},
    backgroundClient: { send, timeoutCode: "TIMEOUT" },
    getSettings: () => settings,
    getCacheEpoch: () => 0,
    getLocal: async () => ({}),
    cacheEpochValue: (value) => Number(value) || 0,
    cacheHasTranslation: () => false,
    cacheUpdateMeta: () => ({}),
    translateTextInContent: async () => "fallback",
    throwIfAborted: () => {},
    persistContentCache: async () => true,
    setBrowserTranslatorStatus: () => {},
    updateProviderModeFromBrowserStatus: () => {},
    setProviderMode: () => {},
    translationLooksSuspicious: () => false,
    message: () => "failed",
    untranslatedTexts: (texts, response) => texts.filter((text) => !response.translated[text]),
    mergeTranslationResponses: (first) => first
  });
}

test("translation provider keeps the on-device-only engine fail-closed", async () => {
  let backgroundCalls = 0;
  const provider = createProvider({ ...Constants.DEFAULT_SETTINGS, translationEngine: "device" }, async () => {
    backgroundCalls += 1;
    return { ok: true };
  });
  const response = await provider.sendTranslationBatch({ targetLanguage: "ko", texts: ["Course text"] }, 1000);
  assert.equal(response.ok, false);
  assert.equal(response.errors["Course text"], "engine-disallowed");
  assert.equal(backgroundCalls, 0);
});

test("translation provider sends Ollama through the selected model without remote fallback", async () => {
  let payload;
  const provider = createProvider(
    { ...Constants.DEFAULT_SETTINGS, translationEngine: "ollama", ollamaModel: "qwen3.5:9b" },
    async (message) => {
      payload = message;
      return { ok: false, translated: {}, errors: { "Course text": "offline" } };
    }
  );
  const response = await provider.sendTranslationBatch({ targetLanguage: "ko", texts: ["Course text"] }, 1000);
  assert.equal(payload.translationEngine, "ollama");
  assert.equal(payload.ollamaModel, "qwen3.5:9b");
  assert.equal(response.errors["Course text"], "offline");
});
