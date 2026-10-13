const assert = require("node:assert/strict");
const test = require("node:test");
const ReadingProvider = require("../src/lib/reading-provider.js");
const TermNotes = require("../src/lib/term-notes.js");

test("reference notes match whole terms and prefer specific concepts", () => {
  assert.equal(TermNotes.findNotes("Tokenization has many components.").length, 0);
  const notes = TermNotes.findNotes("A large language model uses a context window.");
  assert.equal(notes[0].term, "large language model");
  assert.ok(notes.some((note) => note.term === "context window"));
  assert.ok(notes.every((note) => note.source.url.startsWith("https://developers.openai.com/")));
});

test("device reference notes do not require or initialize a language model", async () => {
  let creates = 0;
  const result = await ReadingProvider.explainOnDevice({
    original: "Embeddings can support semantic search.",
    targetLanguage: "en",
    scope: { LanguageModel: { async availability() { creates += 1; throw new Error("Must not run"); } } }
  });
  assert.equal(result.ok, true);
  assert.equal(result.kind, "reference");
  assert.equal(result.provider, "curated-device");
  assert.equal(creates, 0);
  assert.equal(result.sources.length, 1);
});

test("device explanation never implicitly downloads a translation model", async () => {
  let translated = false;
  const result = await ReadingProvider.explainOnDevice({
    original: "A context window has limits.", targetLanguage: "ko", scope: {},
    browserTranslator: {
      async availability() { return { status: "downloadable" }; },
      async translateText() { translated = true; return "문맥"; }
    }
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /translation-downloadable/);
  assert.equal(translated, false);
});

test("device explanation preserves selected language without cloud fallback", async () => {
  const controller = new AbortController();
  let translationOptions;
  const result = await ReadingProvider.explainOnDevice({
    original: "Use embeddings for semantic search.", targetLanguage: "ko", scope: {},
    signal: controller.signal, allowDownload: true,
    browserTranslator: {
      async availability() { return { status: "downloadable" }; },
      async translateText(text, options) {
        assert.match(text, /numerical representation/);
        translationOptions = options;
        return "임베딩은 의미적 유사성을 비교하기 위한 숫자 표현입니다.";
      }
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.provider, "curated-device");
  assert.equal(translationOptions.signal, controller.signal);
  assert.equal(translationOptions.allowDownload, true);
});

test("generated device explanations serialize context and release their session", async () => {
  let destroyed = 0;
  const scope = {
    LanguageModel: {
      async availability(options) {
        assert.deepEqual(options.expectedOutputs, [{ type: "text", languages: ["en"] }]);
        return "available";
      },
      async create(options) {
        assert.match(options.initialPrompts[0].content, /untrusted quoted/);
        return {
          async prompt(input) {
            const data = JSON.parse(input);
            assert.match(data.context, /Lesson heading/);
            return "Check the result against the original evidence before relying on it.";
          },
          destroy() { destroyed += 1; }
        };
      }
    }
  };
  const result = await ReadingProvider.explainOnDevice({
    original: "Check the result before sharing it.", targetLanguage: "en", scope,
    context: { heading: "Lesson heading" }
  });
  assert.equal(result.ok, true);
  assert.equal(result.provider, "browser-language-model");
  assert.equal(destroyed, 1);
});

test("aborted explanation does not inspect model availability", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => ReadingProvider.explainOnDevice({
    original: "Check the result.", targetLanguage: "en", signal: controller.signal,
    scope: { LanguageModel: { availability() { throw new Error("Must not run"); } } }
  }), { name: "AbortError" });
});
