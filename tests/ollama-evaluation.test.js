const assert = require("node:assert/strict");
const test = require("node:test");

const Evaluation = require("../scripts/test-ollama-models.js");

test("Ollama evaluation corpus has five explicitly labelled cases per target language", () => {
  const groups = Evaluation.groupCorpus(Evaluation.corpus);
  assert.deepEqual([...groups.keys()], ["ko", "ja", "es", "zh-CN"]);
  for (const [targetLanguage, cases] of groups) {
    assert.equal(cases.length, 5, targetLanguage);
    assert.ok(cases.every((item) => item.targetLanguage === targetLanguage));
  }
});

test("Ollama evaluation reports quality and scores separately for every language", async () => {
  const calls = [];
  const translator = {
    async translateTexts(sources, targetLanguage, model) {
      calls.push({ sources, targetLanguage, model });
      const cases = Evaluation.corpus.filter((item) => item.targetLanguage === targetLanguage);
      return cases.map((item) => item.keywords.map((group) => group[0]).join(" "));
    }
  };

  const result = await Evaluation.evaluateModel(translator, "test-model");

  assert.equal(result.ok, true);
  assert.equal(result.passed, 20);
  assert.equal(result.total, 20);
  assert.deepEqual(
    calls.map((call) => call.targetLanguage),
    ["ko", "ja", "es", "zh-CN"]
  );
  assert.equal(
    calls.every((call) => call.model === "test-model" && call.sources.length === 5),
    true
  );
  for (const language of result.languages) {
    assert.equal(language.passed, 5, language.targetLanguage);
    assert.equal(language.total, 5, language.targetLanguage);
    assert.ok(language.cases.every((item) => item.targetLanguage === language.targetLanguage));
  }
});

test("Ollama evaluation keeps a failed language visible instead of collapsing it into a model error", async () => {
  const translator = {
    async translateTexts(_sources, targetLanguage) {
      if (targetLanguage === "ja") throw new Error("model does not support Japanese");
      const cases = Evaluation.corpus.filter((item) => item.targetLanguage === targetLanguage);
      return cases.map((item) => item.keywords.map((group) => group[0]).join(" "));
    }
  };

  const result = await Evaluation.evaluateModel(translator, "test-model");
  const japanese = result.languages.find((item) => item.targetLanguage === "ja");

  assert.equal(result.ok, false);
  assert.equal(japanese.ok, false);
  assert.equal(japanese.total, 5);
  assert.equal(japanese.error, "model does not support Japanese");
});
