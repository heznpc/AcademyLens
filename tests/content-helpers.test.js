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
