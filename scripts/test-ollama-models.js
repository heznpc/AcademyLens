const Constants = require("../src/lib/constants.js");
const OllamaTranslator = require("../src/lib/ollama-translator.js");

const endpoint = process.env.OLLAMA_OPENAI_ENDPOINT || OllamaTranslator.DEFAULT_ENDPOINT;
const sourceText = "Build reliable AI agents with clear instructions and human oversight.";

async function main() {
  const translator = OllamaTranslator.create({ endpoint, timeoutMs: 300000 });
  const results = [];

  for (const model of Constants.OLLAMA_MODELS) {
    const startedAt = Date.now();
    try {
      const translated = await translator.translateText(sourceText, "Korean (ko)", model);
      const elapsedMs = Date.now() - startedAt;
      if (!translated || translated.trim() === sourceText) {
        throw new Error("model did not return a translated response");
      }
      const result = { model, ok: true, elapsedMs, translated };
      results.push(result);
      console.log(JSON.stringify(result));
    } catch (error) {
      const result = { model, ok: false, elapsedMs: Date.now() - startedAt, error: error.message || String(error) };
      results.push(result);
      console.error(JSON.stringify(result));
    }
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
