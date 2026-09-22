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
        entry.status === "community-reviewed" &&
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
    assert(["llm-drafted", "llm-audited", "community-reviewed", "native-reviewed", "reviewed"].includes(record.status));
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

test("prefers exact course phrases before protected term masking", () => {
  const original = "Learn the fundamentals of AI, large language models, and ChatGPT through hands-on practice.";
  const prepared = Glossary.prepareForTranslation(original, glossary, "ko");
  const restored = Glossary.restoreProtectedTerms(prepared.text, prepared.placeholders);

  assert.equal(restored, "실습을 통해 AI, 대규모 언어 모델, ChatGPT의 기본기를 배웁니다.");
  assert.equal(prepared.text, "__AL_TERM_0__");
});

test("does not replace single-word terms inside hyphenated compounds", () => {
  const original = "Use model-specific and tool-calling examples with schema-first design.";
  const prepared = Glossary.prepareForTranslation(original, glossary, "ko");
  const restored = Glossary.restoreProtectedTerms(prepared.text, prepared.placeholders);

  assert.equal(restored, "Use model-specific and tool-calling 예제 with schema-first design.");
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

test("reuses a preparer without sharing tokens or changing masking precedence and boundaries", () => {
  const prepare = Glossary.createTranslationPreparer(
    {
      locale: "ko",
      protectedTerms: ["OpenAI", "OpenAI Academy", "agent", "OpenAI", "", "   "],
      terms: [
        { source: "agent", target: "에이전트" },
        { source: "AI agent", target: "AI 에이전트" },
        { source: "C++", target: "시플러스플러스" },
        { source: "", target: "unused" },
        { source: "skip", target: "" },
        null
      ]
    },
    "ko"
  );
  const original = "An AI AGENT uses AGENT at OpenAI Academy with C++. agent-based xagent agent's agent’s agent_2.";
  const expected = {
    text: "An __AL_TERM_0__ uses __AL_TERM_1__ at __AL_TERM_3__ with __AL_TERM_2__. agent-based xagent agent's agent’s agent_2.",
    placeholders: [
      { token: "__AL_TERM_0__", value: "AI 에이전트" },
      { token: "__AL_TERM_1__", value: "에이전트" },
      { token: "__AL_TERM_2__", value: "시플러스플러스" },
      { token: "__AL_TERM_3__", value: "OpenAI Academy" }
    ]
  };

  const first = prepare(original);
  assert.deepEqual(first, expected);
  assert.deepEqual(prepare("No matching words or skip."), { text: "No matching words or skip.", placeholders: [] });
  assert.deepEqual(prepare(original), expected);
  first.placeholders[0].value = "changed by caller";
  first.placeholders.push({ token: "extra", value: "extra" });
  assert.deepEqual(prepare(original), expected);
});

test("snapshots each preparer while one-shot preparation picks up glossary edits", () => {
  const pack = {
    locale: "ko",
    protectedTerms: ["OpenAI"],
    terms: [{ source: "agent", target: "에이전트" }]
  };
  const prepare = Glossary.createTranslationPreparer(pack, "ko");
  pack.terms[0].source = "model";
  pack.terms[0].target = "모델";
  pack.protectedTerms[0] = "ChatGPT";

  const original = "agent OpenAI model ChatGPT";
  assert.deepEqual(prepare(original), {
    text: "__AL_TERM_0__ __AL_TERM_1__ model ChatGPT",
    placeholders: [
      { token: "__AL_TERM_0__", value: "에이전트" },
      { token: "__AL_TERM_1__", value: "OpenAI" }
    ]
  });
  assert.deepEqual(Glossary.prepareForTranslation(original, pack, "ko"), {
    text: "agent OpenAI __AL_TERM_0__ __AL_TERM_1__",
    placeholders: [
      { token: "__AL_TERM_0__", value: "모델" },
      { token: "__AL_TERM_1__", value: "ChatGPT" }
    ]
  });
});

test("preparers retain protected terms for mismatched locales and empty glossary entries", () => {
  for (const pack of [
    { locale: "ko", protectedTerms: ["OpenAI"], terms: [{ source: "agent", target: "에이전트" }] },
    { locale: "ja", protectedTerms: ["OpenAI"], terms: [null, { source: "agent", target: "" }] }
  ]) {
    const prepare = Glossary.createTranslationPreparer(pack, "ja");
    assert.deepEqual(prepare("OPENAI agent"), {
      text: "__AL_TERM_0__ agent",
      placeholders: [{ token: "__AL_TERM_0__", value: "OpenAI" }]
    });
  }

  assert.deepEqual(Glossary.createTranslationPreparer(null, "ko")(42), { text: "42", placeholders: [] });
});

test("maskTermValues retains callbacks and existing placeholder numbering", () => {
  const existing = [{ token: "__AL_TERM_0__", value: "kept" }];
  const masked = Glossary.maskTermValues(
    "TERM term skip",
    [
      null,
      { source: "", value: "unused" },
      { source: "skip", value: "" },
      { source: "term", value: (value) => value.toLowerCase() }
    ],
    existing
  );

  assert.deepEqual(masked, {
    text: "__AL_TERM_1__ __AL_TERM_2__ skip",
    placeholders: [
      { token: "__AL_TERM_0__", value: "kept" },
      { token: "__AL_TERM_1__", value: "term" },
      { token: "__AL_TERM_2__", value: "term" }
    ]
  });
  assert.deepEqual(existing, [{ token: "__AL_TERM_0__", value: "kept" }]);
});
