const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, join, resolve } = require("node:path");

const Constants = require("../src/lib/constants.js");
const OllamaTranslator = require("../src/lib/ollama-translator.js");
const TranslationQuality = require("../src/lib/translation-quality.js");

const endpoint = process.env.OLLAMA_OPENAI_ENDPOINT || OllamaTranslator.DEFAULT_ENDPOINT;
const corpus = JSON.parse(readFileSync(join(__dirname, "fixtures/ollama-evaluation.json"), "utf8"));

function argValue(name, fallback = "") {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}

function keywordScore(translated, groups) {
  const normalized = String(translated || "").toLowerCase();
  const matched = groups.filter((group) => group.some((keyword) => normalized.includes(keyword.toLowerCase()))).length;
  return { matched, total: groups.length };
}

async function main() {
  const translator = OllamaTranslator.create({ endpoint, timeoutMs: 300000 });
  const results = [];
  const requestedModel = argValue("--model");
  const models = requestedModel ? [Constants.normalizeOllamaModel(requestedModel)] : Constants.OLLAMA_MODELS;

  for (const model of models) {
    const startedAt = Date.now();
    try {
      const translations = await translator.translateTexts(
        corpus.map((item) => item.source),
        "ko",
        model
      );
      const elapsedMs = Date.now() - startedAt;
      const cases = corpus.map((item, index) => {
        const translated = translations[index];
        const quality = TranslationQuality.validate(item.source, translated, "ko");
        const keywords = keywordScore(translated, item.keywords);
        return {
          source: item.source,
          translated,
          quality,
          keywords,
          ok: quality.ok && keywords.matched === keywords.total
        };
      });
      const passed = cases.filter((item) => item.ok).length;
      const result = {
        model,
        ok: passed === cases.length,
        elapsedMs,
        passed,
        total: cases.length,
        score: Math.round((passed / cases.length) * 100),
        cases
      };
      results.push(result);
      console.log(JSON.stringify(result));
    } catch (error) {
      const result = { model, ok: false, elapsedMs: Date.now() - startedAt, error: error.message || String(error) };
      results.push(result);
      console.error(JSON.stringify(result));
    }
  }

  const output = argValue("--out");
  if (output) {
    const resolved = resolve(output);
    mkdirSync(dirname(resolved), { recursive: true });
    writeFileSync(
      resolved,
      `${JSON.stringify({ endpoint, evaluatedAt: new Date().toISOString(), results }, null, 2)}\n`
    );
  }

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    throw new Error(`${failures.length} Ollama model smoke test(s) failed`);
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});
