const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const Cache = require("../src/lib/cache.js");

const ROOT = join(__dirname, "..");

function response(status, translated) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return [[translated ? [translated, "", null, null] : []]];
    }
  };
}

function ollamaResponse(status, translated) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return { choices: [{ message: { content: translated || "" } }] };
    }
  };
}

function loadBackground(fetchImpl, options = {}) {
  const listeners = [];
  const storage = {
    "academylens.settings": {
      targetLanguage: "ko",
      translationEngine: options.selectedTranslationEngine || "remote",
      ollamaModel: options.selectedOllamaModel || "qwen3.5:4b"
    }
  };
  let storageSetCalls = 0;
  const context = {
    AbortController,
    URL,
    clearTimeout,
    console,
    fetch: fetchImpl,
    setTimeout,
    chrome: {
      storage: {
        local: {
          async get(keys) {
            if (Array.isArray(keys)) {
              return Object.fromEntries(keys.map((key) => [key, storage[key]]));
            }
            return { [keys]: storage[keys] };
          },
          async set(values) {
            if (options.failStorageSet) throw new Error("storage unavailable");
            storageSetCalls += 1;
            if (options.delayFirstStorageSetMs && storageSetCalls === 1) {
              await new Promise((resolve) => setTimeout(resolve, options.delayFirstStorageSetMs));
            }
            Object.assign(storage, values);
          }
        }
      },
      runtime: {
        onMessage: {
          addListener(listener) {
            listeners.push(listener);
          }
        }
      },
      permissions: {
        // The remote Google Translate host is an optional permission. Tests grant it
        // by default and can revoke it with options.remotePermissionGranted = false.
        async contains(details) {
          if (options.remotePermissionContainsThrows) throw new Error("permission check unavailable");
          if (details.origins.includes("http://localhost:11434/*")) {
            return options.ollamaPermissionGranted !== false;
          }
          return options.remotePermissionGranted !== false;
        }
      }
    }
  };
  if (typeof options.detectLanguage === "function") {
    context.chrome.i18n = { detectLanguage: options.detectLanguage };
  }
  context.self = context;
  context.globalThis = context;
  context.importScripts = (...scripts) => {
    for (const script of scripts) {
      const fullPath = resolve(ROOT, "src/background", script);
      vm.runInContext(readFileSync(fullPath, "utf8"), context, { filename: fullPath });
    }
  };
  vm.createContext(context);
  vm.runInContext(readFileSync(join(ROOT, "src/background/background.js"), "utf8"), context, {
    filename: "src/background/background.js"
  });

  async function send(message) {
    assert.equal(listeners.length, 1);
    return new Promise((resolveResponse) => {
      listeners[0](message, {}, resolveResponse);
    });
  }

  return { send, storage };
}

test("background translation retries transient failures", async () => {
  let calls = 0;
  const { send } = loadBackground(async () => {
    calls += 1;
    return calls === 1 ? response(503) : response(200, "AI 기초");
  });

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "remote",
    targetLanguage: "ko",
    texts: ["AI Foundations"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.translated["AI Foundations"], "AI 기초");
  assert.equal(calls, 2);
});

test("background rejects Google output in the wrong target language", async () => {
  const source = "Build reliable agents.";
  const { send, storage } = loadBackground(async () => response(200, "Completely unrelated English sentence."));

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "remote",
    targetLanguage: "es",
    texts: [source]
  });

  assert.equal(result.ok, false);
  assert.equal(result.translated[source], undefined);
  assert.match(result.errors[source], /quality check failed: wrong-target-language:en/);
  assert.equal(result.stats.failed, 1);
  assert.equal(Object.keys(storage["academylens.translationCache.v1"] || {}).length, 0);
});

test("background rejects high-confidence cross-Latin Google output", async () => {
  const source = "Build reliable systems with clear review instructions.";
  const french = "Les équipes construisent des systèmes fiables avec des instructions de révision claires.";
  const detectedSamples = [];
  const { send, storage } = loadBackground(async () => response(200, french), {
    async detectLanguage(sample) {
      detectedSamples.push(sample);
      return { isReliable: true, languages: [{ language: "fr", percentage: 96 }] };
    }
  });

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "remote",
    targetLanguage: "es",
    texts: [source]
  });

  assert.equal(result.ok, false);
  assert.equal(result.translated[source], undefined);
  assert.match(result.errors[source], /quality check failed: detected-language-mismatch:fr/);
  assert.deepEqual(detectedSamples, [french]);
  assert.equal(Object.keys(storage["academylens.translationCache.v1"] || {}).length, 0);
});

test("background accepts Latin loanwords when Google output is reliably in the target language", async () => {
  const source = "Use software and internet tools safely to complete the course and review every result.";
  const spanish =
    "Utilice software e internet de forma segura para completar el curso y revisar cuidadosamente todos los resultados.";
  const { send, storage } = loadBackground(async () => response(200, spanish), {
    async detectLanguage() {
      return { isReliable: true, languages: [{ language: "es", percentage: 98 }] };
    }
  });

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "remote",
    targetLanguage: "es",
    texts: [source]
  });

  assert.equal(result.ok, true);
  assert.equal(result.translated[source], spanish);
  assert.equal(result.stats.failed, 0);
  assert.equal(Object.keys(storage["academylens.translationCache.v1"] || {}).length, 1);
});

test("background revalidates and replaces a bad Google cache hit", async () => {
  let fetchCalls = 0;
  const { send, storage } = loadBackground(async () => {
    fetchCalls += 1;
    return response(200, "신뢰할 수 있는 에이전트를 구축하세요.");
  });
  const source = "Build reliable agents.";
  const scope = { provider: "google-translate" };
  const key = Cache.cacheKey("ko", source, scope);
  storage["academylens.translationCache.v1"] = {
    [key]: {
      original: source,
      translated: "Completely unrelated English sentence.",
      targetLanguage: "ko",
      ...Cache.normalizeScope(scope),
      createdAt: 1,
      accessedAt: 1
    }
  };

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "remote",
    targetLanguage: "ko",
    texts: [source]
  });

  assert.equal(result.ok, true);
  assert.equal(result.translated[source], "신뢰할 수 있는 에이전트를 구축하세요.");
  assert.equal(result.stats.cacheHits, 0);
  assert.equal(result.stats.cacheMisses, 1);
  assert.equal(result.stats.qualityRejectedCacheHits, 1);
  assert.equal(fetchCalls, 1);
  assert.equal(storage["academylens.translationCache.v1"][key].translated, "신뢰할 수 있는 에이전트를 구축하세요.");
});

test("background revalidates a Google cache hit with high-confidence language detection", async () => {
  let fetchCalls = 0;
  const source = "Build reliable systems with clear review instructions.";
  const french = "Les équipes construisent des systèmes fiables avec des instructions de révision claires.";
  const spanish = "Los equipos construyen sistemas fiables con instrucciones claras para revisar los resultados.";
  const { send, storage } = loadBackground(
    async () => {
      fetchCalls += 1;
      return response(200, spanish);
    },
    {
      async detectLanguage(sample) {
        const language = sample.includes("Les équipes") ? "fr" : "es";
        return { isReliable: true, languages: [{ language, percentage: 97 }] };
      }
    }
  );
  const scope = { provider: "google-translate" };
  const key = Cache.cacheKey("es", source, scope);
  storage["academylens.translationCache.v1"] = {
    [key]: {
      original: source,
      translated: french,
      targetLanguage: "es",
      ...Cache.normalizeScope(scope)
    }
  };

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "remote",
    targetLanguage: "es",
    texts: [source]
  });

  assert.equal(result.ok, true);
  assert.equal(result.stats.cacheHits, 0);
  assert.equal(result.stats.qualityRejectedCacheHits, 1);
  assert.equal(fetchCalls, 1);
  assert.equal(result.translated[source], spanish);
  assert.equal(storage["academylens.translationCache.v1"][key].translated, spanish);
});

test("background translation returns partial success with per-text errors", async () => {
  const { send } = loadBackground(async (url) => {
    const text = new URL(url).searchParams.get("q");
    return text === "Broken text" ? response(500) : response(200, "좋은 번역입니다");
  });

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "remote",
    targetLanguage: "ko",
    texts: ["Good text", "Broken text"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.translated["Good text"], "좋은 번역입니다");
  assert.match(result.errors["Broken text"], /500/);
  assert.equal(result.stats.failed, 1);
});

test("background translation does not retry non-retryable HTTP failures", async () => {
  let calls = 0;
  const { send } = loadBackground(async () => {
    calls += 1;
    return response(404);
  });

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "remote",
    targetLanguage: "ko",
    texts: ["Missing text"]
  });

  assert.equal(result.ok, false);
  assert.equal(result.stats.failed, 1);
  assert.equal(calls, 1);
});

test("background translation dedupes in-flight requests across batches", async () => {
  let calls = 0;
  let release;
  const blocker = new Promise((resolveBlocker) => {
    release = resolveBlocker;
  });
  const { send } = loadBackground(async () => {
    calls += 1;
    await blocker;
    return response(200, "공유 번역");
  });

  const first = send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "remote",
    targetLanguage: "ko",
    texts: ["Shared text"]
  });
  const second = send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "remote",
    targetLanguage: "ko",
    texts: ["Shared text"]
  });
  release();

  const results = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(results[0].translated["Shared text"], "공유 번역");
  assert.equal(results[1].translated["Shared text"], "공유 번역");
});

test("background translation limits concurrent remote fetches", async () => {
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const { send } = loadBackground(async () => {
    calls += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
    return response(200, `번역 문장 ${calls}`);
  });

  const texts = Array.from({ length: 12 }, (_, index) => `Text ${index}`);
  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "remote",
    targetLanguage: "ko",
    texts
  });

  assert.equal(result.ok, true);
  assert.equal(calls, 12);
  assert(maxActive <= 5, `expected max concurrency <= 5, got ${maxActive}`);
});

test("background translation merges concurrent cache writes", async () => {
  let release;
  const blocker = new Promise((resolveBlocker) => {
    release = resolveBlocker;
  });
  const { send, storage } = loadBackground(async (url) => {
    const text = new URL(url).searchParams.get("q");
    if (text === "First text") await blocker;
    return response(200, text === "First text" ? "첫 번째 번역" : "두 번째 번역");
  });

  const first = send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "remote",
    targetLanguage: "ko",
    texts: ["First text"]
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const second = send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "remote",
    targetLanguage: "ko",
    texts: ["Second text"]
  });
  release();
  await Promise.all([first, second]);

  const originals = Object.values(storage["academylens.translationCache.v1"])
    .map((entry) => entry.original)
    .sort();
  assert.deepEqual(originals, ["First text", "Second text"]);
});

test("background cache persistence message serializes concurrent content writes", async () => {
  const { send, storage } = loadBackground(async () => response(200), {
    delayFirstStorageSetMs: 25
  });

  const first = send({
    type: "ACADEMYLENS_PERSIST_CACHE_UPDATES",
    expectedCacheEpoch: 0,
    cacheUpdates: {
      "ko:google-translate:g0:c0:first": {
        original: "Frame one text",
        translated: "프레임 1",
        targetLanguage: "ko",
        provider: "google-translate",
        glossarySignature: "g0",
        correctionSignature: "c0",
        createdAt: 1,
        accessedAt: 1
      }
    }
  });
  const second = send({
    type: "ACADEMYLENS_PERSIST_CACHE_UPDATES",
    expectedCacheEpoch: 0,
    cacheUpdates: {
      "ko:google-translate:g0:c0:second": {
        original: "Frame two text",
        translated: "프레임 2",
        targetLanguage: "ko",
        provider: "google-translate",
        glossarySignature: "g0",
        correctionSignature: "c0",
        createdAt: 2,
        accessedAt: 2
      }
    }
  });

  const results = await Promise.all([first, second]);
  assert.deepEqual(
    results.map((result) => result.persisted),
    [true, true]
  );

  const originals = Object.values(storage["academylens.translationCache.v1"])
    .map((entry) => entry.original)
    .sort();
  assert.deepEqual(originals, ["Frame one text", "Frame two text"]);
});

test("background cache persistence message applies native-provider deletion keys", async () => {
  const { send, storage } = loadBackground(async () => response(200));
  const rejectedKey = "es:browser-translator:g0:c0:rejected";
  const retainedKey = "es:browser-translator:g0:c0:retained";
  storage["academylens.translationCache.v1"] = {
    [rejectedKey]: { original: "Rejected", translated: "Incorrect", targetLanguage: "es" },
    [retainedKey]: { original: "Retained", translated: "Correcto", targetLanguage: "es" }
  };

  const result = await send({
    type: "ACADEMYLENS_PERSIST_CACHE_UPDATES",
    expectedCacheEpoch: 0,
    cacheUpdates: {},
    cacheDeleteKeys: [rejectedKey]
  });

  assert.equal(result.persisted, true);
  assert.equal(storage["academylens.translationCache.v1"][rejectedKey], undefined);
  assert.equal(storage["academylens.translationCache.v1"][retainedKey].translated, "Correcto");
});

test("background cache clear serializes with pending cache writes", async () => {
  const { send, storage } = loadBackground(async () => response(200), {
    delayFirstStorageSetMs: 25
  });

  const persist = send({
    type: "ACADEMYLENS_PERSIST_CACHE_UPDATES",
    expectedCacheEpoch: 0,
    cacheUpdates: {
      "ko:google-translate:g0:c0:stale": {
        original: "Stale in-flight text",
        translated: "오래된 텍스트",
        targetLanguage: "ko",
        provider: "google-translate",
        glossarySignature: "g0",
        correctionSignature: "c0",
        createdAt: 1,
        accessedAt: 1
      }
    }
  });
  const clear = send({ type: "ACADEMYLENS_CLEAR_CACHE" });

  const [persistResult, clearResult] = await Promise.all([persist, clear]);

  assert.equal(persistResult.persisted, true);
  assert.equal(clearResult.cleared, true);
  assert.equal(clearResult.cacheEpoch, 1);
  assert.equal(Object.keys(storage["academylens.translationCache.v1"]).length, 0);
  assert.equal(storage["academylens.translationCacheEpoch.v1"], 1);
});

test("background translation returns fetched translations when cache persistence fails", async () => {
  const { send } = loadBackground(async () => response(200, "좋은 번역입니다"), { failStorageSet: true });

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "remote",
    targetLanguage: "ko",
    texts: ["Good text"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.translated["Good text"], "좋은 번역입니다");
  assert.equal(result.stats.cachePersistFailed, true);
});

test("background rejects every non-explicit remote engine without fetching", async (t) => {
  const invalidEngines = [
    { name: "missing", value: undefined },
    { name: "legacy auto", value: "auto" },
    { name: "device", value: "device" },
    { name: "unknown", value: "hosted" }
  ];

  for (const permissionGranted of [true, false]) {
    for (const invalidEngine of invalidEngines) {
      await t.test(`${invalidEngine.name}; permission ${permissionGranted ? "granted" : "denied"}`, async () => {
        let fetchCalls = 0;
        const { send } = loadBackground(
          async () => {
            fetchCalls += 1;
            return response(200, "should not happen");
          },
          { remotePermissionGranted: permissionGranted }
        );
        const message = {
          type: "ACADEMYLENS_TRANSLATE_BATCH",
          targetLanguage: "ko",
          texts: ["Course text"]
        };
        if (invalidEngine.value !== undefined) message.translationEngine = invalidEngine.value;

        const result = await send(message);

        assert.equal(result.ok, false);
        assert.match(result.error, /explicit remote translation engine required/i);
        assert.equal(fetchCalls, 0);
      });
    }
  }
});

test("background rejects stale requests that no longer match the stored engine or Ollama model", async (t) => {
  const mismatches = [
    {
      name: "device selected after a remote request was prepared",
      options: { selectedTranslationEngine: "device" },
      message: { translationEngine: "remote" },
      error: /selected translation engine/i
    },
    {
      name: "remote selected after an Ollama request was prepared",
      options: { selectedTranslationEngine: "remote" },
      message: { translationEngine: "ollama", ollamaModel: "qwen3.5:4b" },
      error: /selected translation engine/i
    },
    {
      name: "Ollama model changed before the request arrived",
      options: { selectedTranslationEngine: "ollama", selectedOllamaModel: "qwen3.5:4b" },
      message: { translationEngine: "ollama", ollamaModel: "qwen3.5:9b" },
      error: /selected Ollama model/i
    }
  ];

  for (const mismatch of mismatches) {
    await t.test(mismatch.name, async () => {
      let fetchCalls = 0;
      const { send } = loadBackground(async () => {
        fetchCalls += 1;
        return response(200, "should not happen");
      }, mismatch.options);

      const result = await send({
        type: "ACADEMYLENS_TRANSLATE_BATCH",
        targetLanguage: "ko",
        texts: ["Course text"],
        ...mismatch.message
      });

      assert.equal(result.ok, false);
      assert.match(result.error, mismatch.error);
      assert.equal(fetchCalls, 0);
    });
  }
});

test("background translation refuses to fetch when the optional remote permission is not granted", async () => {
  let fetchCalls = 0;
  const { send } = loadBackground(
    async () => {
      fetchCalls += 1;
      return response(200, "should not happen");
    },
    { remotePermissionGranted: false }
  );
  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "remote",
    targetLanguage: "ko",
    texts: ["Good text"]
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /permission not granted/i);
  assert.equal(Object.keys(result.translated).length, 0);
  assert.equal(fetchCalls, 0, "no course text may reach the network without the permission grant");
});

test("background translation fails closed when the permission check itself throws", async () => {
  let fetchCalls = 0;
  const { send } = loadBackground(
    async () => {
      fetchCalls += 1;
      return response(200, "should not happen");
    },
    { remotePermissionContainsThrows: true }
  );
  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "remote",
    targetLanguage: "ko",
    texts: ["Good text"]
  });
  assert.equal(result.ok, false);
  assert.equal(fetchCalls, 0, "an unreadable permission state must not allow a network call");
});

test("background translation rejects a batch with no target language instead of assuming one", async () => {
  let fetchCalls = 0;
  const { send } = loadBackground(async () => {
    fetchCalls += 1;
    return response(200, "should not happen");
  });
  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "remote",
    texts: ["Good text"]
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /no target language/i);
  assert.equal(fetchCalls, 0);
});

test("background routes the Ollama engine through the selected local model", async () => {
  let request;
  const { send, storage } = loadBackground(
    async (url, options) => {
      request = { url, options };
      return ollamaResponse(200, "신뢰할 수 있는 에이전트를 구축하세요.");
    },
    { selectedTranslationEngine: "ollama", selectedOllamaModel: "qwen3.5:9b" }
  );

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "ollama",
    ollamaModel: "qwen3.5:9b",
    targetLanguage: "ko",
    texts: ["Build reliable agents."]
  });

  assert.equal(result.ok, true);
  assert.equal(result.translated["Build reliable agents."], "신뢰할 수 있는 에이전트를 구축하세요.");
  assert.equal(request.url, "http://localhost:11434/v1/chat/completions");
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, "qwen3.5:9b");
  assert.equal(body.reasoning_effort, "none");
  const cacheEntry = Object.values(storage["academylens.translationCache.v1"])[0];
  assert.equal(cacheEntry.provider, "ollama-qwen3.5_9b");
});

test("background batches Ollama cache misses into one model request", async () => {
  const requests = [];
  const { send } = loadBackground(
    async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return ollamaResponse(200, '["첫 번째", "두 번째", "세 번째"]');
    },
    { selectedTranslationEngine: "ollama" }
  );

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "ollama",
    ollamaModel: "qwen3.5:4b",
    targetLanguage: "ko",
    texts: ["First", "Second", "Third"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.translated.First, "첫 번째");
  assert.equal(result.translated.Second, "두 번째");
  assert.equal(result.translated.Third, "세 번째");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.reasoning_effort, "none");
});

test("background retries only an Ollama item that fails the quality contract", async () => {
  const requests = [];
  const { send } = loadBackground(
    async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      if (body.messages[1].content.includes("Input JSON")) {
        return ollamaResponse(200, '["첫 번째", "Second source copied"]');
      }
      return ollamaResponse(200, "두 번째 번역");
    },
    { selectedTranslationEngine: "ollama" }
  );

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "ollama",
    ollamaModel: "qwen3.5:4b",
    targetLanguage: "ko",
    texts: ["First", "Second source copied"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.translated.First, "첫 번째");
  assert.equal(result.translated["Second source copied"], "두 번째 번역");
  assert.equal(requests.length, 2);
});

test("background retries high-confidence cross-Latin Ollama output", async () => {
  const source = "Build reliable systems with clear review instructions.";
  const french = "Les équipes construisent des systèmes fiables avec des instructions de révision claires.";
  const spanish = "Los equipos construyen sistemas fiables con instrucciones claras para revisar los resultados.";
  let fetchCalls = 0;
  const { send } = loadBackground(
    async () => {
      fetchCalls += 1;
      return ollamaResponse(200, fetchCalls === 1 ? french : spanish);
    },
    {
      selectedTranslationEngine: "ollama",
      async detectLanguage(sample) {
        const language = sample.includes("Les équipes") ? "fr" : "es";
        return { isReliable: true, languages: [{ language, percentage: 98 }] };
      }
    }
  );

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "ollama",
    ollamaModel: "qwen3.5:4b",
    targetLanguage: "es",
    texts: [source]
  });

  assert.equal(result.ok, true);
  assert.equal(fetchCalls, 2);
  assert.equal(result.translated[source], spanish);
});

test("background revalidates and replaces a bad Ollama cache hit", async () => {
  let fetchCalls = 0;
  const { send, storage } = loadBackground(
    async () => {
      fetchCalls += 1;
      return ollamaResponse(200, "신뢰할 수 있는 에이전트를 구축하세요.");
    },
    { selectedTranslationEngine: "ollama", selectedOllamaModel: "qwen3.5:4b" }
  );
  const source = "Build reliable agents.";
  const scope = { provider: "ollama-qwen3.5:4b" };
  const key = Cache.cacheKey("ko", source, scope);
  storage["academylens.translationCache.v1"] = {
    [key]: {
      original: source,
      translated: "Completely unrelated English sentence.",
      targetLanguage: "ko",
      ...Cache.normalizeScope(scope),
      createdAt: 1,
      accessedAt: 1
    }
  };

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "ollama",
    ollamaModel: "qwen3.5:4b",
    targetLanguage: "ko",
    texts: [source]
  });

  assert.equal(result.ok, true);
  assert.equal(result.translated[source], "신뢰할 수 있는 에이전트를 구축하세요.");
  assert.equal(result.stats.cacheHits, 0);
  assert.equal(result.stats.cacheMisses, 1);
  assert.equal(result.stats.qualityRejectedCacheHits, 1);
  assert.equal(fetchCalls, 1);
  assert.equal(storage["academylens.translationCache.v1"][key].translated, "신뢰할 수 있는 에이전트를 구축하세요.");
});

test("background removes a rejected Ollama cache entry when replacement quality also fails", async () => {
  let fetchCalls = 0;
  const { send, storage } = loadBackground(
    async () => {
      fetchCalls += 1;
      return ollamaResponse(200, "Completely unrelated English sentence.");
    },
    { selectedTranslationEngine: "ollama" }
  );
  const source = "Build reliable agents.";
  const scope = { provider: "ollama-qwen3.5:4b" };
  const key = Cache.cacheKey("ko", source, scope);
  storage["academylens.translationCache.v1"] = {
    [key]: {
      original: source,
      translated: "Another unrelated English answer.",
      targetLanguage: "ko",
      ...Cache.normalizeScope(scope)
    }
  };

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "ollama",
    ollamaModel: "qwen3.5:4b",
    targetLanguage: "ko",
    texts: [source]
  });

  assert.equal(result.ok, false);
  assert.equal(result.stats.qualityRejectedCacheHits, 1);
  assert.equal(result.stats.failed, 1);
  assert.equal(fetchCalls, 2, "a bad fresh result gets one item-level retry");
  assert.equal(storage["academylens.translationCache.v1"][key], undefined);
});

test("background removes a rejected Ollama cache entry when replacement transport fails", async () => {
  const { send, storage } = loadBackground(async () => ollamaResponse(503), {
    selectedTranslationEngine: "ollama"
  });
  const source = "Build reliable agents.";
  const scope = { provider: "ollama-qwen3.5:4b" };
  const key = Cache.cacheKey("ko", source, scope);
  storage["academylens.translationCache.v1"] = {
    [key]: {
      original: source,
      translated: "Completely unrelated English sentence.",
      targetLanguage: "ko",
      ...Cache.normalizeScope(scope)
    }
  };

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "ollama",
    ollamaModel: "qwen3.5:4b",
    targetLanguage: "ko",
    texts: [source]
  });

  assert.equal(result.ok, false);
  assert.equal(result.stats.qualityRejectedCacheHits, 1);
  assert.equal(result.stats.failed, 1);
  assert.equal(storage["academylens.translationCache.v1"][key], undefined);
});

test("background preserves valid Ollama cache hits while replacing rejected entries in the same batch", async () => {
  const { send, storage } = loadBackground(async () => ollamaResponse(200, "교체된 번역입니다."), {
    selectedTranslationEngine: "ollama"
  });
  const validSource = "Keep cached translation.";
  const invalidSource = "Replace invalid translation.";
  const scope = { provider: "ollama-qwen3.5:4b" };
  const validKey = Cache.cacheKey("ko", validSource, scope);
  const invalidKey = Cache.cacheKey("ko", invalidSource, scope);
  storage["academylens.translationCache.v1"] = {
    [validKey]: {
      original: validSource,
      translated: "캐시된 번역을 유지합니다.",
      targetLanguage: "ko",
      ...Cache.normalizeScope(scope)
    },
    [invalidKey]: {
      original: invalidSource,
      translated: "Completely unrelated English sentence.",
      targetLanguage: "ko",
      ...Cache.normalizeScope(scope)
    }
  };

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "ollama",
    ollamaModel: "qwen3.5:4b",
    targetLanguage: "ko",
    texts: [validSource, invalidSource]
  });

  assert.equal(result.ok, true);
  assert.equal(result.stats.cacheHits, 1);
  assert.equal(result.stats.cacheMisses, 1);
  assert.equal(result.stats.qualityRejectedCacheHits, 1);
  assert.equal(result.translated[validSource], "캐시된 번역을 유지합니다.");
  assert.equal(result.translated[invalidSource], "교체된 번역입니다.");
  assert.equal(storage["academylens.translationCache.v1"][validKey].translated, "캐시된 번역을 유지합니다.");
  assert.equal(storage["academylens.translationCache.v1"][invalidKey].translated, "교체된 번역입니다.");
});

test("background rejects an English Ollama cache hit for a Latin-language target", async () => {
  const { send, storage } = loadBackground(async () => ollamaResponse(200, "Construya agentes fiables."), {
    selectedTranslationEngine: "ollama"
  });
  const source = "Build reliable agents.";
  const scope = { provider: "ollama-qwen3.5:4b" };
  const key = Cache.cacheKey("es", source, scope);
  storage["academylens.translationCache.v1"] = {
    [key]: {
      original: source,
      translated: "Completely unrelated English sentence.",
      targetLanguage: "es",
      ...Cache.normalizeScope(scope)
    }
  };

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "ollama",
    ollamaModel: "qwen3.5:4b",
    targetLanguage: "es",
    texts: [source]
  });

  assert.equal(result.ok, true);
  assert.equal(result.stats.qualityRejectedCacheHits, 1);
  assert.equal(result.translated[source], "Construya agentes fiables.");
  assert.equal(storage["academylens.translationCache.v1"][key].translated, "Construya agentes fiables.");
});

test("background rejects a cross-Latin Ollama cache hit using high-confidence detection", async () => {
  const source = "Build reliable systems with clear review instructions.";
  const french = "Les équipes construisent des systèmes fiables avec des instructions de révision claires.";
  const spanish = "Los equipos construyen sistemas fiables con instrucciones claras para revisar los resultados.";
  let fetchCalls = 0;
  const { send, storage } = loadBackground(
    async () => {
      fetchCalls += 1;
      return ollamaResponse(200, spanish);
    },
    {
      selectedTranslationEngine: "ollama",
      async detectLanguage(sample) {
        const language = sample.includes("Les équipes") ? "fr" : "es";
        return { isReliable: true, languages: [{ language, percentage: 98 }] };
      }
    }
  );
  const scope = { provider: "ollama-qwen3.5:4b" };
  const key = Cache.cacheKey("es", source, scope);
  storage["academylens.translationCache.v1"] = {
    [key]: {
      original: source,
      translated: french,
      targetLanguage: "es",
      ...Cache.normalizeScope(scope)
    }
  };

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "ollama",
    ollamaModel: "qwen3.5:4b",
    targetLanguage: "es",
    texts: [source]
  });

  assert.equal(result.ok, true);
  assert.equal(result.stats.cacheHits, 0);
  assert.equal(result.stats.qualityRejectedCacheHits, 1);
  assert.equal(fetchCalls, 1);
  assert.equal(result.translated[source], spanish);
  assert.equal(storage["academylens.translationCache.v1"][key].translated, spanish);
});

test("background exposes Ollama health and selected model installation", async () => {
  const { send, storage } = loadBackground(
    async (url) => {
      assert.equal(url, "http://localhost:11434/api/tags");
      return {
        ok: true,
        async json() {
          return { models: [{ name: "qwen3.5:4b" }, { name: "gemma3:4b" }] };
        }
      };
    },
    { selectedTranslationEngine: "ollama" }
  );

  const ready = await send({ type: "ACADEMYLENS_CHECK_OLLAMA", ollamaModel: "qwen3.5:4b" });
  assert.equal(ready.ok, true);
  assert.equal(ready.status, "ready");
  assert.deepEqual(Array.from(ready.models), ["qwen3.5:4b", "gemma3:4b"]);

  storage["academylens.settings"].ollamaModel = "gemma4:12b";
  const missing = await send({ type: "ACADEMYLENS_CHECK_OLLAMA", ollamaModel: "gemma4:12b" });
  assert.equal(missing.ok, false);
  assert.equal(missing.status, "model-missing");
});

test("background refuses stale Ollama health checks before localhost access", async () => {
  let fetchCalls = 0;
  const { send } = loadBackground(
    async () => {
      fetchCalls += 1;
      return {
        ok: true,
        async json() {
          return { models: [] };
        }
      };
    },
    { selectedTranslationEngine: "device" }
  );

  const result = await send({ type: "ACADEMYLENS_CHECK_OLLAMA", ollamaModel: "qwen3.5:4b" });

  assert.equal(result.ok, false);
  assert.equal(result.status, "selection-mismatch");
  assert.equal(fetchCalls, 0);
});

test("background cancellation aborts the active Ollama fetch", async () => {
  let fetchAborted = false;
  const { send } = loadBackground(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => {
            fetchAborted = true;
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          },
          { once: true }
        );
      }),
    { selectedTranslationEngine: "ollama" }
  );
  const pending = send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    operationId: "frame:generation-1",
    translationEngine: "ollama",
    ollamaModel: "qwen3.5:4b",
    targetLanguage: "ko",
    texts: ["A request that should be cancelled"]
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const cancelled = await send({ type: "ACADEMYLENS_CANCEL_TRANSLATION", operationId: "frame:generation-1" });
  const result = await pending;

  assert.equal(cancelled.cancelled, true);
  assert.equal(fetchAborted, true);
  assert.equal(result.ok, false);
  assert.equal(result.stats.failed, 1);
});

test("background refuses Ollama requests without localhost permission", async () => {
  let fetchCalls = 0;
  const { send } = loadBackground(
    async () => {
      fetchCalls += 1;
      return ollamaResponse(200, "번역");
    },
    {
      ollamaPermissionGranted: false,
      selectedTranslationEngine: "ollama",
      selectedOllamaModel: "gemma3:4b"
    }
  );

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    translationEngine: "ollama",
    ollamaModel: "gemma3:4b",
    targetLanguage: "ko",
    texts: ["Course text"]
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /localhost permission not granted/i);
  assert.equal(fetchCalls, 0);
});
