const assert = require("node:assert/strict");
const test = require("node:test");

const BrowserTranslator = require("../src/lib/browser-translator.js");

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
