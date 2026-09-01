const assert = require("node:assert/strict");
const test = require("node:test");

const Constants = require("../src/lib/constants.js");
const TranslationQuality = require("../src/lib/translation-quality.js");
const TranslationProvider = require("../src/content/translation-provider.js");

function createProvider(settings, send, overrides = {}) {
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
    mergeTranslationResponses: (first) => first,
    ...overrides
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

test("translation provider applies the shared quality contract to native output", async (t) => {
  const cases = [
    {
      name: "valid target-language output",
      targetLanguage: "ko",
      translated: "신뢰할 수 있는 에이전트를 구축하세요.",
      expectedOk: true
    },
    {
      name: "wrong target-language output for a distinctive script",
      targetLanguage: "ko",
      translated: "An unrelated English answer.",
      expectedOk: false
    },
    {
      name: "strong English output for a Latin non-English target",
      targetLanguage: "es",
      translated: "Completely unrelated English sentence.",
      expectedOk: false
    }
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const provider = createProvider(
        { ...Constants.DEFAULT_SETTINGS, translationEngine: "device" },
        async () => {
          throw new Error("background must not be called");
        },
        {
          BrowserTranslator: {
            PROVIDER_ID: "browser-translator",
            async availability() {
              return { status: "available" };
            },
            async translateBatch() {
              return { "Build reliable agents.": item.translated };
            }
          },
          translationLooksSuspicious: (original, translated, targetLanguage) =>
            !TranslationQuality.validate(original, translated, targetLanguage).ok
        }
      );

      const response = await provider.sendTranslationBatch({
        targetLanguage: item.targetLanguage,
        texts: ["Build reliable agents."],
        cacheEpoch: 0
      });

      assert.equal(response.ok, item.expectedOk);
      if (item.expectedOk) {
        assert.equal(response.translated["Build reliable agents."], item.translated);
      } else {
        assert.equal(response.translated["Build reliable agents."], undefined);
        assert.equal(response.errors["Build reliable agents."], "failed");
      }
    });
  }
});

test("translation provider revalidates native cache entries before serving them", async () => {
  let translatorCalls = 0;
  const source = "Build reliable agents.";
  const provider = createProvider(
    { ...Constants.DEFAULT_SETTINGS, translationEngine: "device" },
    async () => {
      throw new Error("background must not be called");
    },
    {
      BrowserTranslator: {
        PROVIDER_ID: "browser-translator",
        async availability() {
          return { status: "available" };
        },
        async translateBatch() {
          translatorCalls += 1;
          return { [source]: "신뢰할 수 있는 에이전트를 구축하세요." };
        }
      },
      getLocal: async () => ({
        [Constants.STORAGE_KEYS.CACHE_EPOCH]: 0,
        [Constants.STORAGE_KEYS.CACHE]: {
          [source]: {
            original: source,
            translated: "Completely unrelated English sentence.",
            targetLanguage: "ko"
          }
        }
      }),
      cacheHasTranslation: () => true,
      translationLooksSuspicious: (original, translated, targetLanguage) =>
        !TranslationQuality.validate(original, translated, targetLanguage).ok
    }
  );

  const response = await provider.sendTranslationBatch({ targetLanguage: "ko", texts: [source], cacheEpoch: 0 });

  assert.equal(translatorCalls, 1);
  assert.equal(response.translated[source], "신뢰할 수 있는 에이전트를 구축하세요.");
  assert.equal(response.stats.cacheHits, 0);
  assert.equal(response.stats.cacheMisses, 1);
});

test("translation provider rejects high-confidence cross-Latin native output", async () => {
  const source = "Build reliable systems with clear review instructions.";
  const french = "Les équipes construisent des systèmes fiables avec des instructions de révision claires.";
  const provider = createProvider(
    { ...Constants.DEFAULT_SETTINGS, translationEngine: "device" },
    async () => {
      throw new Error("background must not be called");
    },
    {
      BrowserTranslator: {
        PROVIDER_ID: "browser-translator",
        async availability() {
          return { status: "available" };
        },
        async translateBatch() {
          return { [source]: french };
        }
      },
      validateTranslation: (original, translated, targetLanguage) =>
        TranslationQuality.validateAsync(original, translated, targetLanguage, async () => ({
          isReliable: true,
          languages: [{ language: "fr", percentage: 96 }]
        }))
    }
  );

  const response = await provider.sendTranslationBatch({ targetLanguage: "es", texts: [source], cacheEpoch: 0 });

  assert.equal(response.ok, false);
  assert.equal(response.translated[source], undefined);
  assert.equal(response.errors[source], "failed");
  assert.equal(response.stats.failed, 1);
});

test("translation provider accepts Latin loanwords when native output is reliably in the target language", async () => {
  const source = "Use software and internet tools safely to complete the course and review every result.";
  const spanish =
    "Utilice software e internet de forma segura para completar el curso y revisar cuidadosamente todos los resultados.";
  const provider = createProvider(
    { ...Constants.DEFAULT_SETTINGS, translationEngine: "device" },
    async () => {
      throw new Error("background must not be called");
    },
    {
      BrowserTranslator: {
        PROVIDER_ID: "browser-translator",
        async availability() {
          return { status: "available" };
        },
        async translateBatch() {
          return { [source]: spanish };
        }
      },
      validateTranslation: (original, translated, targetLanguage) =>
        TranslationQuality.validateAsync(original, translated, targetLanguage, async () => ({
          isReliable: true,
          languages: [{ language: "es", percentage: 98 }]
        }))
    }
  );

  const response = await provider.sendTranslationBatch({ targetLanguage: "es", texts: [source], cacheEpoch: 0 });

  assert.equal(response.ok, true);
  assert.equal(response.translated[source], spanish);
  assert.equal(response.stats.failed, 0);
});

test("translation provider revalidates native cache hits with high-confidence language detection", async () => {
  const source = "Build reliable systems with clear review instructions.";
  const french = "Les équipes construisent des systèmes fiables avec des instructions de révision claires.";
  const spanish = "Los equipos construyen sistemas fiables con instrucciones claras para revisar los resultados.";
  const persistenceCalls = [];
  let translatorCalls = 0;
  const provider = createProvider(
    { ...Constants.DEFAULT_SETTINGS, translationEngine: "device" },
    async () => {
      throw new Error("background must not be called");
    },
    {
      BrowserTranslator: {
        PROVIDER_ID: "browser-translator",
        async availability() {
          return { status: "available" };
        },
        async translateBatch() {
          translatorCalls += 1;
          return { [source]: spanish };
        }
      },
      getLocal: async () => ({
        [Constants.STORAGE_KEYS.CACHE_EPOCH]: 0,
        [Constants.STORAGE_KEYS.CACHE]: {
          [source]: { original: source, translated: french, targetLanguage: "es" }
        }
      }),
      cacheHasTranslation: () => true,
      persistContentCache: async (...args) => {
        persistenceCalls.push(args);
        return true;
      },
      validateTranslation: (original, translated, targetLanguage) =>
        TranslationQuality.validateAsync(original, translated, targetLanguage, async (sample) => ({
          isReliable: true,
          languages: [{ language: sample.includes("Les équipes") ? "fr" : "es", percentage: 97 }]
        }))
    }
  );

  const response = await provider.sendTranslationBatch({ targetLanguage: "es", texts: [source], cacheEpoch: 0 });

  assert.equal(response.ok, true);
  assert.equal(translatorCalls, 1);
  assert.equal(response.stats.cacheHits, 0);
  assert.equal(response.stats.qualityRejectedCacheHits, 1);
  assert.equal(response.translated[source], spanish);
  assert.deepEqual(persistenceCalls[0][3], [source]);
  assert.equal(persistenceCalls[0][0][source].translated, spanish);
});

test("translation provider deletes a rejected native cache hit when fresh quality also fails", async () => {
  const source = "Build reliable systems with clear review instructions.";
  const french = "Les équipes construisent des systèmes fiables avec des instructions de révision claires.";
  const persistenceCalls = [];
  const provider = createProvider(
    { ...Constants.DEFAULT_SETTINGS, translationEngine: "device" },
    async () => {
      throw new Error("background must not be called");
    },
    {
      BrowserTranslator: {
        PROVIDER_ID: "browser-translator",
        async availability() {
          return { status: "available" };
        },
        async translateBatch() {
          return { [source]: french };
        }
      },
      getLocal: async () => ({
        [Constants.STORAGE_KEYS.CACHE_EPOCH]: 0,
        [Constants.STORAGE_KEYS.CACHE]: {
          [source]: { original: source, translated: french, targetLanguage: "es" }
        }
      }),
      cacheHasTranslation: () => true,
      persistContentCache: async (...args) => {
        persistenceCalls.push(args);
        return true;
      },
      validateTranslation: (original, translated, targetLanguage) =>
        TranslationQuality.validateAsync(original, translated, targetLanguage, async () => ({
          isReliable: true,
          languages: [{ language: "fr", percentage: 98 }]
        }))
    }
  );

  const response = await provider.sendTranslationBatch({ targetLanguage: "es", texts: [source], cacheEpoch: 0 });

  assert.equal(response.ok, false);
  assert.equal(response.stats.qualityRejectedCacheHits, 1);
  assert.deepEqual(persistenceCalls[0][0], {});
  assert.deepEqual(persistenceCalls[0][3], [source]);
});

test("translation provider deletes a rejected native cache hit when fresh translation throws", async () => {
  const source = "Build reliable systems with clear review instructions.";
  const french = "Les équipes construisent des systèmes fiables avec des instructions de révision claires.";
  const persistenceCalls = [];
  const provider = createProvider(
    { ...Constants.DEFAULT_SETTINGS, translationEngine: "device" },
    async () => {
      throw new Error("background must not be called");
    },
    {
      BrowserTranslator: {
        PROVIDER_ID: "browser-translator",
        async availability() {
          return { status: "available" };
        },
        async translateBatch() {
          throw new Error("native translator crashed");
        }
      },
      getLocal: async () => ({
        [Constants.STORAGE_KEYS.CACHE_EPOCH]: 0,
        [Constants.STORAGE_KEYS.CACHE]: {
          [source]: { original: source, translated: french, targetLanguage: "es" }
        }
      }),
      cacheHasTranslation: () => true,
      persistContentCache: async (...args) => {
        persistenceCalls.push(args);
        return true;
      },
      validateTranslation: (original, translated, targetLanguage) =>
        TranslationQuality.validateAsync(original, translated, targetLanguage, async () => ({
          isReliable: true,
          languages: [{ language: "fr", percentage: 98 }]
        }))
    }
  );

  const response = await provider.sendTranslationBatch({ targetLanguage: "es", texts: [source], cacheEpoch: 0 });

  assert.equal(response.ok, false);
  assert.deepEqual(persistenceCalls[0][0], {});
  assert.deepEqual(persistenceCalls[0][3], [source]);
});

test("aborting a native request cannot publish a stale unavailable status", async () => {
  const controller = new AbortController();
  const statuses = [];
  const modes = [];
  const fallbackStatuses = [];
  const provider = createProvider(
    { ...Constants.DEFAULT_SETTINGS, translationEngine: "device", enableBrowserTranslatorDownloads: true },
    async () => {
      throw new Error("background must not be called");
    },
    {
      BrowserTranslator: {
        PROVIDER_ID: "browser-translator",
        async availability() {
          return { status: "downloadable" };
        },
        async translateBatch(_texts, options) {
          options.onDownloadProgress();
          controller.abort();
          options.onDownloadProgress();
          const error = new Error("aborted");
          error.name = "AbortError";
          throw error;
        }
      },
      setBrowserTranslatorStatus: (status) => statuses.push(status),
      setProviderMode: (mode) => modes.push(mode),
      updateProviderModeFromBrowserStatus: (status) => fallbackStatuses.push(status)
    }
  );

  await assert.rejects(
    provider.sendTranslationBatch(
      { targetLanguage: "ko", texts: ["Build reliable agents."], cacheEpoch: 0 },
      1000,
      controller.signal
    ),
    { name: "AbortError" }
  );

  assert.deepEqual(statuses, ["downloadable", "downloading"]);
  assert.deepEqual(modes, ["nativeDownloading", "nativeDownloading"]);
  assert.deepEqual(fallbackStatuses, []);
});
