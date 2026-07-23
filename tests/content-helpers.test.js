const assert = require("node:assert/strict");
const test = require("node:test");

const ContentHelpers = require("../src/content/content-helpers.js");
const Cache = require("../src/lib/cache.js");
const Text = require("../src/lib/text-utils.js");

test("content helpers build stable cache scope from provider, glossary, and corrections", () => {
  const helpers = ContentHelpers.create({ Cache, Text });
  const glossary = {
    locale: "ko",
    protectedTerms: ["ChatGPT"],
    terms: [{ source: "course", target: "강좌" }]
  };
  const corrections = {
    "ko:abc": {
      original: "OpenAI Academy",
      translated: "OpenAI Academy",
      targetLanguage: "ko"
    }
  };

  const scope = helpers.cacheScope("browser-translator", glossary, corrections);

  assert.equal(scope.provider, "browser-translator");
  assert.match(scope.glossarySignature, /^g-ko-1-1-/);
  assert.match(scope.correctionSignature, /^c-1-/);
});

test("content helpers find local corrections and sort manager entries", () => {
  const helpers = ContentHelpers.create({ Cache, Text });
  const firstKey = helpers.correctionKey("ko", "Build practical skills");
  const secondKey = helpers.correctionKey("ja", "AI Foundations");
  const corrections = {
    [firstKey]: {
      original: "Build practical skills",
      translated: "실용 기술 구축",
      targetLanguage: "ko"
    },
    [secondKey]: {
      original: "AI Foundations",
      translated: "AI 基礎",
      targetLanguage: "ja"
    }
  };

  assert.equal(helpers.correctionFor(corrections, "ko", "Build practical skills"), "실용 기술 구축");
  assert.equal(helpers.correctionFor(corrections, "ko", "AI Foundations"), "");
  assert.deepEqual(
    helpers.correctionEntries(corrections).map(([key]) => key),
    [secondKey, firstKey]
  );
});

test("content helpers reject placeholder drift and merge native fallback responses", () => {
  const helpers = ContentHelpers.create({ Cache, Text });

  assert.equal(
    helpers.translationLooksSuspicious("Use __AL_TERM_0__ safely.", "__AL_TERM_1__를 안전하게 사용하세요.", "ko"),
    true
  );
  assert.equal(
    helpers.translationLooksSuspicious("Use ChatGPT safely.", "ChatGPT를 안전하게 사용하세요.", "ko"),
    false
  );

  const merged = helpers.mergeTranslationResponses(
    {
      ok: true,
      translated: { a: "A" },
      errors: { b: "native miss" },
      stats: { provider: "browser-translator" }
    },
    {
      ok: true,
      translated: { b: "B" },
      errors: {},
      stats: { requested: 1, fallback: true }
    },
    ["a", "b"]
  );

  assert.deepEqual(merged.translated, { a: "A", b: "B" });
  assert.deepEqual(merged.errors, {});
  assert.equal(merged.stats.fallback.requested, 1);
  assert.deepEqual(helpers.untranslatedTexts(["a", "b", "c"], merged), ["c"]);
});

test("content helpers group translation context and diagnostics", () => {
  const helpers = ContentHelpers.create({ Cache, Text, Node: { TEXT_NODE: 3 } });
  const section = {
    tagName: "SECTION",
    id: "lesson",
    getAttribute(name) {
      return name === "data-testid" ? "lesson-content" : "";
    }
  };
  const element = {
    nodeType: 1,
    parentElement: null,
    closest() {
      return section;
    }
  };
  const groups = new Map();
  const seen = new Set();

  helpers.appendContextText(groups, seen, { target: element }, "Learn with ChatGPT");
  helpers.appendContextText(groups, seen, { target: element }, "Learn with ChatGPT");

  assert.deepEqual(helpers.orderedContextTexts(groups), ["Learn with ChatGPT"]);

  const diagnostics = helpers.mergeDiagnostics(
    {
      cacheHits: 0,
      cacheMisses: 0,
      fallbackTexts: 0,
      corrections: 0,
      contextGroups: 0,
      frames: 0,
      frameApplied: 0,
      frameFailed: 0
    },
    helpers.diagnosticsFromResponse({ stats: { cacheHits: 2, cacheMisses: 1, provider: "native" } }, 3, "fallback")
  );

  assert.equal(diagnostics.cacheHits, 2);
  assert.equal(diagnostics.cacheMisses, 1);
  assert.equal(diagnostics.provider, "native");
});

test("chunks splits values into fixed-size batches", () => {
  assert.deepEqual(ContentHelpers.chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(ContentHelpers.chunks([], 3), []);
  assert.deepEqual(ContentHelpers.chunks(["a", "b"], 5), [["a", "b"]]);
});

test("cacheEpochValue keeps only positive finite epochs", () => {
  assert.equal(ContentHelpers.cacheEpochValue(7), 7);
  assert.equal(ContentHelpers.cacheEpochValue(2.5), 2.5);
  assert.equal(ContentHelpers.cacheEpochValue(0), 0);
  assert.equal(ContentHelpers.cacheEpochValue(-3), 0);
  assert.equal(ContentHelpers.cacheEpochValue("nope"), 0);
  assert.equal(ContentHelpers.cacheEpochValue(undefined), 0);
});

test("candidateElement resolves text nodes to their parent element", () => {
  const NodeRef = { TEXT_NODE: 3 };
  const parent = { tagName: "P" };
  const textNode = { nodeType: 3, parentElement: parent };
  const element = { nodeType: 1 };

  assert.equal(ContentHelpers.candidateElement(NodeRef, { target: textNode }), parent);
  assert.equal(ContentHelpers.candidateElement(NodeRef, { target: element }), element);
  assert.equal(ContentHelpers.candidateElement(NodeRef, {}), undefined);
});

test("hasUnexpectedPlaceholderTokens detects protected-term drift", () => {
  assert.equal(ContentHelpers.hasUnexpectedPlaceholderTokens("Learn ChatGPT", "안녕하세요"), false);
  assert.equal(ContentHelpers.hasUnexpectedPlaceholderTokens("Learn ChatGPT", "__AL_TERM_0__ 학습"), true);
  assert.equal(ContentHelpers.hasUnexpectedPlaceholderTokens("__AL_TERM_0__", "번역됨"), true);
  assert.equal(ContentHelpers.hasUnexpectedPlaceholderTokens("__AL_TERM_0__", "__AL_TERM_0__ 번역"), false);
  assert.equal(ContentHelpers.hasUnexpectedPlaceholderTokens("__AL_TERM_0__", "__AL_TERM_1__"), true);
});

test("cacheHasTranslation delegates to Cache.entryMatches and falls back safely", () => {
  const cache = {
    k1: { translated: "AI 기초", original: "AI Foundations", targetLanguage: "ko" },
    k2: { translated: "", original: "AI Foundations", targetLanguage: "ko" }
  };

  // The delegate keys off the scope argument (which the built-in fallback ignores)
  // and deliberately accepts a query whose text does NOT match the stored entry —
  // an outcome the fallback can never produce. So these assertions fail if the
  // Cache.entryMatches delegation is dropped or the scope argument is not threaded.
  const delegatingCache = {
    entryMatches(entry, text, targetLanguage, scope) {
      return Boolean(entry && entry.translated) && Boolean(scope) && scope.provider === "browser-translator";
    }
  };
  assert.equal(
    ContentHelpers.cacheHasTranslation(delegatingCache, cache, "k1", "different query", "ko", {
      provider: "browser-translator"
    }),
    true
  );
  assert.equal(
    ContentHelpers.cacheHasTranslation(delegatingCache, cache, "k1", "different query", "ko", { provider: "google" }),
    false
  );

  // Fallback branch: Cache without entryMatches uses the built-in guard.
  assert.equal(ContentHelpers.cacheHasTranslation({}, cache, "k1", "AI Foundations", "ko", {}), true);
  assert.equal(ContentHelpers.cacheHasTranslation({}, cache, "k1", "Other text", "ko", {}), false);
  assert.equal(ContentHelpers.cacheHasTranslation({}, cache, "k2", "AI Foundations", "ko", {}), false);
  assert.equal(ContentHelpers.cacheHasTranslation({}, cache, "missing", "AI Foundations", "ko", {}), false);
});

test("cacheUpdateMeta delegates to Cache.normalizeScope and falls back to empty meta", () => {
  const normalizingCache = {
    normalizeScope(scope) {
      return { provider: scope.provider };
    }
  };
  assert.deepEqual(ContentHelpers.cacheUpdateMeta(normalizingCache, { provider: "google-translate" }), {
    provider: "google-translate"
  });
  assert.deepEqual(ContentHelpers.cacheUpdateMeta({}, { provider: "google-translate" }), {});
});
