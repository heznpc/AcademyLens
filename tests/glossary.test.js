const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const Glossary = require("../src/lib/glossary.js");
const { QUALITY_SMOKE_TERMS } = require("../scripts/lib/glossary-config.js");

const glossaryIndex = JSON.parse(readFileSync(join(__dirname, "../src/data/glossary.index.json"), "utf8"));
const glossary = JSON.parse(readFileSync(join(__dirname, "../src/data/glossary.ko.json"), "utf8"));
const premiumLocales = glossaryIndex.premiumLocales;

test("registers installed premium glossaries", () => {
  assert(glossaryIndex.protectedTerms.includes("OpenAI Academy"));
  assert.equal(glossaryIndex.premiumLocales.length, 13);
  assert.equal(glossaryIndex.glossaries.length, premiumLocales.length);
  assert(
    glossaryIndex.glossaries.some(
      (entry) =>
        entry.locale === "ko" &&
        entry.path === "src/data/glossary.ko.json" &&
        entry.status === "reviewed" &&
        entry.termCount === glossary.terms.length
    )
  );
});

test("keeps locale quality smoke terms in premium glossary packs", () => {
  for (const [locale, expectedTerms] of Object.entries(QUALITY_SMOKE_TERMS)) {
    const pack = JSON.parse(readFileSync(join(__dirname, `../src/data/glossary.${locale}.json`), "utf8"));
    for (const [source, target] of Object.entries(expectedTerms)) {
      const entry = pack.terms.find((term) => term.source === source);
      assert(entry, `${locale} missing smoke term: ${source}`);
      assert.equal(entry.target, target);
    }
  }
});

test("registers premium glossary packs with matching source keys", () => {
  const baseline = new Set(glossary.terms.map((entry) => entry.source));

  for (const locale of premiumLocales) {
    const record = glossaryIndex.glossaries.find((entry) => entry.locale === locale);
    assert(record, `missing ${locale} registry entry`);
    assert.equal(record.termCount, glossary.terms.length);
    assert(["llm-drafted", "reviewed"].includes(record.status));
    assert(record.xTranslationCheck);

    const pack = JSON.parse(readFileSync(join(__dirname, `../src/data/glossary.${locale}.json`), "utf8"));
    assert.equal(pack.locale, locale);
    assert.equal(pack.status, record.status);
    assert.equal(pack.terms.length, glossary.terms.length);
    assert(pack.qaSignals.xTranslationCheck);
    assert.deepEqual(
      new Set(pack.terms.map((entry) => entry.source)),
      baseline,
      `${locale} should keep the shared English source key set`
    );
  }
});

test("masks and restores protected OpenAI terms", () => {
  const original = "OpenAI Academy introduces ChatGPT, GPT, and LLM workflows.";
  const masked = Glossary.maskProtectedTerms(original, glossary.protectedTerms);

  assert.notEqual(masked.text, original);
  assert(!masked.text.includes("OpenAI Academy"));
  assert(!masked.text.includes("ChatGPT"));

  const restored = Glossary.restoreProtectedTerms(masked.text, masked.placeholders);
  assert.equal(restored, original);
});

test("normalizes glossary entries", () => {
  const normalized = Glossary.normalizeGlossary(glossary);

  assert.equal(normalized.locale, "ko");
  assert(normalized.protectedTerms.includes("OpenAI"));
  assert(normalized.protectedTerms.includes("ChatGPT"));
  assert(normalized.protectedTerms.includes("GPT"));
  assert(normalized.terms.some((entry) => entry.source === "workflow"));
  assert(
    normalized.terms.some(
      (entry) =>
        entry.source === "clear instructions" &&
        entry.category === "prompting" &&
        entry.sources.includes("academy:courses")
    )
  );
  assert(
    normalized.terms.some(
      (entry) =>
        entry.source === "structured outputs" &&
        entry.category === "structured-output" &&
        entry.sources.includes("openai-docs:structured-outputs")
    )
  );
});

test("prepares installed glossary terms as target-language placeholders", () => {
  const original = "Artificial intelligence workflows use OpenAI Academy prompts with clear instructions.";
  const prepared = Glossary.prepareForTranslation(original, glossary, "ko");

  assert(!prepared.text.includes("Artificial intelligence"));
  assert(!prepared.text.includes("OpenAI Academy"));
  assert(prepared.placeholders.some((placeholder) => placeholder.value === "인공지능"));
  assert(prepared.placeholders.some((placeholder) => placeholder.value === "OpenAI Academy"));

  const restored = Glossary.restoreProtectedTerms(prepared.text, prepared.placeholders);
  assert.equal(restored, "인공지능 워크플로 use OpenAI Academy 프롬프트 with 명확한 지시.");
});

test("prepares common plural course terms for reviewed glossary correction", () => {
  const original = "Reusable prompts help agents build workflows with models.";
  const prepared = Glossary.prepareForTranslation(original, glossary, "ko");
  const restored = Glossary.restoreProtectedTerms(prepared.text, prepared.placeholders);

  assert.equal(restored, "Reusable 프롬프트 help 에이전트 build 워크플로 with 모델.");
});

test("does not apply locale-specific glossary terms to other target languages", () => {
  const original = "Artificial intelligence uses prompts.";
  const prepared = Glossary.prepareForTranslation(original, glossary, "ja");

  assert.equal(prepared.text, original);
  assert.deepEqual(prepared.placeholders, []);
});
