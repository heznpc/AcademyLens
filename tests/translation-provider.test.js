const assert = require("node:assert/strict");
const test = require("node:test");

const Constants = require("../src/lib/constants.js");
const TranslationProvider = require("../src/content/translation-provider.js");

function createProvider(settings, send) {
  return TranslationProvider.create({
    constants: Constants,
    Cache: { cacheKey: (_targetLanguage, text) => text },
    BrowserTranslator: {
      PROVIDER_ID: "browser-translator",
      async availability() {
        return { status: "unavailable" };
      },
      async translateBatch() {
        return {};
      }
    },
    backgroundClient: { send, timeoutCode: "TIMEOUT" },
    getSettings: () => settings,
    getCacheEpoch: () => 0,
    getLocal: async () => ({ [Constants.STORAGE_KEYS.CACHE_EPOCH]: 0 }),
    cacheEpochValue: (value) => Number(value) || 0,
    cacheHasTranslation: () => false,
    cacheUpdateMeta: () => ({}),
    throwIfAborted: () => {},
    persistContentCache: async () => true,
    setBrowserTranslatorStatus: () => {},
    updateProviderModeFromBrowserStatus: () => {},
    setProviderMode: () => {},
    translationLooksSuspicious: () => false,
    message: () => "failed",
    mergeTranslationResponses: (first) => first
  });
}

test("translation provider keeps device and legacy auto engines fail-closed", async (t) => {
  for (const translationEngine of ["device", "auto"]) {
    await t.test(translationEngine, async () => {
      let backgroundCalls = 0;
      const provider = createProvider({ ...Constants.DEFAULT_SETTINGS, translationEngine }, async () => {
        backgroundCalls += 1;
        return { ok: true };
      });
      const response = await provider.sendTranslationBatch({ targetLanguage: "ko", texts: ["Course text"] }, 1000);
      assert.equal(response.ok, false);
      assert.equal(response.errors["Course text"], "engine-disallowed");
      assert.equal(backgroundCalls, 0);
    });
  }
});

test("translation provider marks Google requests with the explicit remote engine", async () => {
  let payload;
  const expected = { ok: true, translated: { "Course text": "강의 텍스트" }, errors: {} };
  const provider = createProvider({ ...Constants.DEFAULT_SETTINGS, translationEngine: "remote" }, async (message) => {
    payload = message;
    return expected;
  });

  const response = await provider.sendTranslationBatch({ targetLanguage: "ko", texts: ["Course text"] }, 1000);

  assert.equal(payload.translationEngine, "remote");
  assert.deepEqual(response, expected);
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

test("translation provider keeps remote background failures fail-closed", async (t) => {
  const failures = [
    { name: "permission denial", response: { ok: false, error: "permission not granted" } },
    {
      name: "generic provider failure",
      response: {
        ok: false,
        translated: {},
        errors: { "Course text": "provider unavailable" }
      }
    }
  ];

  for (const failure of failures) {
    await t.test(failure.name, async () => {
      const provider = createProvider(
        { ...Constants.DEFAULT_SETTINGS, translationEngine: "remote" },
        async () => failure.response
      );

      const response = await provider.sendTranslationBatch({ targetLanguage: "ko", texts: ["Course text"] }, 1000);

      assert.deepEqual(response, failure.response);
    });
  }
});
