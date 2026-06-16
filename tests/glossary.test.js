const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const Glossary = require("../src/lib/glossary.js");

const glossary = JSON.parse(readFileSync(join(__dirname, "../src/data/glossary.ko.json"), "utf8"));

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
});

test("prepares Korean glossary terms as target-language placeholders", () => {
  const original = "Artificial intelligence workflows use OpenAI Academy prompts.";
  const prepared = Glossary.prepareForTranslation(original, glossary, "ko");

  assert(!prepared.text.includes("Artificial intelligence"));
  assert(!prepared.text.includes("OpenAI Academy"));
  assert(prepared.placeholders.some((placeholder) => placeholder.value === "인공지능"));
  assert(prepared.placeholders.some((placeholder) => placeholder.value === "OpenAI Academy"));

  const restored = Glossary.restoreProtectedTerms(prepared.text, prepared.placeholders);
  assert.equal(restored, "인공지능 워크플로 use OpenAI Academy 프롬프트.");
});

test("prepares common plural course terms for Korean glossary correction", () => {
  const original = "Reusable prompts help agents build workflows with models.";
  const prepared = Glossary.prepareForTranslation(original, glossary, "ko");
  const restored = Glossary.restoreProtectedTerms(prepared.text, prepared.placeholders);

  assert.equal(restored, "Reusable 프롬프트 help 에이전트 build 워크플로 with 모델.");
});

test("does not apply Korean glossary terms to other target languages", () => {
  const original = "Artificial intelligence uses prompts.";
  const prepared = Glossary.prepareForTranslation(original, glossary, "ja");

  assert.equal(prepared.text, original);
  assert.deepEqual(prepared.placeholders, []);
});
