const assert = require("node:assert/strict");
const test = require("node:test");

const BrowserTranslator = require("../src/lib/browser-translator.js");

test("browser translator stops remaining batch work when cancelled", async () => {
  const controller = new AbortController();
  const requests = [];
  let destroyed = 0;
  const scope = {
    Translator: {
      async availability() { return "available"; },
      async create(options) {
        assert.equal(options.signal, controller.signal);
        return {
          async translate(text, callOptions) {
            assert.equal(callOptions.signal, controller.signal);
            requests.push(text);
            controller.abort();
            return "Cancelled result";
          },
          destroy() { destroyed += 1; }
        };
      }
    }
  };
  await assert.rejects(() => BrowserTranslator.translateBatch(["First", "Second"], {
    scope, targetLanguage: "ko", signal: controller.signal
  }), { name: "AbortError" });
  assert.deepEqual(requests, ["First"]);
  assert.equal(destroyed, 1);
});

test("single-text browser translation requires explicit download permission", async () => {
  let creates = 0;
  await assert.rejects(() => BrowserTranslator.translateText("An explanation", {
    targetLanguage: "ko",
    scope: { Translator: {
      async availability() { return "downloadable"; },
      async create() { creates += 1; }
    } }
  }), /downloadable/);
  assert.equal(creates, 0);
});

test("browser translator reports unsupported when the API is absent", async () => {
  assert.equal(BrowserTranslator.supportStatus({}), "unsupported");
  const result = await BrowserTranslator.availability({
    scope: {},
    sourceLanguage: "en",
    targetLanguage: "ko"
  });

  assert.equal(result.provider, "browser-translator");
  assert.equal(result.status, "unsupported");
});

test("browser translator normalizes legacy Hebrew language code", () => {
  assert.equal(BrowserTranslator.normalizeLanguage("iw"), "he");
  assert.equal(BrowserTranslator.normalizeLanguage("zh-CN"), "zh");
  assert.equal(BrowserTranslator.normalizeLanguage("zh-TW"), "zh-Hant");
  assert.equal(BrowserTranslator.normalizeLanguage("pt-BR"), "pt-BR");
});

test("browser translator checks availability without creating a translator", async () => {
  let createCalls = 0;
  const scope = {
    Translator: {
      async availability(options) {
        assert.deepEqual(options, { sourceLanguage: "en", targetLanguage: "ja" });
        return "downloadable";
      },
      async create() {
        createCalls += 1;
      }
    }
  };

  const result = await BrowserTranslator.availability({
    scope,
    sourceLanguage: "en",
    targetLanguage: "ja"
  });

  assert.equal(result.status, "downloadable");
  assert.equal(createCalls, 0);
});

test("browser translator translates with monitor and destroys the session", async () => {
  let monitorAttached = false;
  let destroyed = false;
  const scope = {
    Translator: {
      async availability() {
        return "available";
      },
      async create(options) {
        options.monitor({
          addEventListener(eventName, listener) {
            assert.equal(eventName, "downloadprogress");
            assert.equal(typeof listener, "function");
            monitorAttached = true;
          }
        });
        return {
          async translate(text) {
            return `translated: ${text}`;
          },
          destroy() {
            destroyed = true;
          }
        };
      }
    }
  };

  const result = await BrowserTranslator.translateText("AI Foundations", {
    scope,
    sourceLanguage: "en",
    targetLanguage: "ko",
    onDownloadProgress() {}
  });

  assert.equal(result, "translated: AI Foundations");
  assert.equal(monitorAttached, true);
  assert.equal(destroyed, true);
});

test("browser translator translates a batch with one session", async () => {
  let createCalls = 0;
  let destroyed = false;
  const scope = {
    Translator: {
      async availability() {
        return "available";
      },
      async create(options) {
        createCalls += 1;
        assert.deepEqual(options.sourceLanguage, "en");
        assert.deepEqual(options.targetLanguage, "ko");
        return {
          async translate(text) {
            return `batch: ${text}`;
          },
          destroy() {
            destroyed = true;
          }
        };
      }
    }
  };

  const result = await BrowserTranslator.translateBatch(["First lesson", "Second lesson"], {
    scope,
    sourceLanguage: "en",
    targetLanguage: "ko"
  });

  assert.deepEqual(result, {
    "First lesson": "batch: First lesson",
    "Second lesson": "batch: Second lesson"
  });
  assert.equal(createCalls, 1);
  assert.equal(destroyed, true);
});

test("browser translator batch avoids implicit downloads by default", async () => {
  let createCalls = 0;
  const scope = {
    Translator: {
      async availability() {
        return "downloadable";
      },
      async create() {
        createCalls += 1;
      }
    }
  };

  await assert.rejects(
    () =>
      BrowserTranslator.translateBatch(["AI Foundations"], {
        scope,
        sourceLanguage: "en",
        targetLanguage: "ko"
      }),
    /downloadable/
  );
  assert.equal(createCalls, 0);
});

test("browser translator batch allows downloads only when requested", async () => {
  let createCalls = 0;
  let monitorAttached = false;
  const scope = {
    Translator: {
      async availability() {
        return "downloadable";
      },
      async create(options) {
        createCalls += 1;
        options.monitor({
          addEventListener(eventName, listener) {
            assert.equal(eventName, "downloadprogress");
            assert.equal(typeof listener, "function");
            monitorAttached = true;
          }
        });
        return {
          async translate(text) {
            return `native: ${text}`;
          },
          destroy() {}
        };
      }
    }
  };

  const result = await BrowserTranslator.translateBatch(["Course text"], {
    scope,
    sourceLanguage: "en",
    targetLanguage: "ko",
    allowDownload: true,
    onDownloadProgress() {}
  });

  assert.deepEqual(result, { "Course text": "native: Course text" });
  assert.equal(createCalls, 1);
  assert.equal(monitorAttached, true);
});
