const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, join, resolve } = require("node:path");

const Constants = require("../src/lib/constants.js");
const OllamaTranslator = require("../src/lib/ollama-translator.js");
const TranslationQuality = require("../src/lib/translation-quality.js");

const endpoint = process.env.OLLAMA_OPENAI_ENDPOINT || OllamaTranslator.DEFAULT_ENDPOINT;
const corpus = Object.freeze(
  JSON.parse(readFileSync(join(__dirname, "fixtures/ollama-evaluation.json"), "utf8")).map((item) =>
    Object.freeze(item)
  )
);

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

function groupCorpus(items) {
  const groups = new Map();
  for (const item of items || []) {
    if (!Constants.SUPPORTED_LANGUAGE_CODES.includes(item.targetLanguage)) {
      throw new Error(`Unsupported evaluation target language: ${item.targetLanguage || "missing"}`);
    }
    if (!item.source || !Array.isArray(item.keywords) || !item.keywords.length) {
      throw new Error(`Invalid evaluation case for ${item.targetLanguage}`);
    }
    if (!groups.has(item.targetLanguage)) groups.set(item.targetLanguage, []);
    groups.get(item.targetLanguage).push(item);
  }
  return groups;
}

async function evaluateLanguage(translator, model, targetLanguage, items) {
  const startedAt = Date.now();
  try {
    const translations = await translator.translateTexts(
      items.map((item) => item.source),
      targetLanguage,
      model
    );
    if (translations.length !== items.length) {
      throw new Error(`Ollama returned ${translations.length}/${items.length} translations`);
    }
    const cases = items.map((item, index) => {
      const translated = translations[index];
      const quality = TranslationQuality.validate(item.source, translated, targetLanguage);
      const keywords = keywordScore(translated, item.keywords);
      return {
        targetLanguage,
        source: item.source,
        translated,
        quality,
        keywords,
        ok: quality.ok && keywords.matched === keywords.total
      };
    });
    const passed = cases.filter((item) => item.ok).length;
    return {
      targetLanguage,
      validation: TranslationQuality.validationProfile(targetLanguage),
      ok: passed === cases.length,
      elapsedMs: Date.now() - startedAt,
      passed,
      total: cases.length,
      score: cases.length ? Math.round((passed / cases.length) * 100) : 0,
      cases
    };
  } catch (error) {
    return {
      targetLanguage,
      validation: TranslationQuality.validationProfile(targetLanguage),
      ok: false,
      elapsedMs: Date.now() - startedAt,
      passed: 0,
      total: items.length,
      score: 0,
      error: error.message || String(error),
      cases: []
    };
  }
}

async function evaluateModel(translator, model, items = corpus) {
  const startedAt = Date.now();
  const languages = [];
  for (const [targetLanguage, languageItems] of groupCorpus(items)) {
    languages.push(await evaluateLanguage(translator, model, targetLanguage, languageItems));
  }
  const passed = languages.reduce((total, language) => total + language.passed, 0);
  const total = languages.reduce((sum, language) => sum + language.total, 0);
  return {
    model,
    ok: languages.length > 0 && languages.every((language) => language.ok),
    elapsedMs: Date.now() - startedAt,
    passed,
    total,
    score: total ? Math.round((passed / total) * 100) : 0,
    languages
  };
}

async function main() {
  const translator = OllamaTranslator.create({ endpoint, timeoutMs: 300000 });
  const results = [];
  const requestedModel = argValue("--model");
  const models = requestedModel ? [Constants.normalizeOllamaModel(requestedModel)] : Constants.OLLAMA_MODELS;

  for (const model of models) {
    const result = await evaluateModel(translator, model);
    results.push(result);
    const log = result.ok ? console.log : console.error;
    log(JSON.stringify(result));
  }

  const output = argValue("--out");
  if (output) {
    const resolved = resolve(output);
    mkdirSync(dirname(resolved), { recursive: true });
    writeFileSync(
      resolved,
      `${JSON.stringify(
        {
          endpoint,
          evaluatedAt: new Date().toISOString(),
          targetLanguages: [...groupCorpus(corpus).keys()],
          corpusCases: corpus.length,
          results
        },
        null,
        2
      )}\n`
    );
  }

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    throw new Error(`${failures.length} Ollama model evaluation(s) failed`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = Object.freeze({
  corpus,
  evaluateLanguage,
  evaluateModel,
  groupCorpus,
  keywordScore,
  main
});
