const assert = require("node:assert/strict");
const test = require("node:test");

const OllamaTranslator = require("../src/lib/ollama-translator.js");

function completion(content, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return { choices: [{ message: { content } }] };
    }
  };
}

test("Ollama request uses the OpenAI-compatible chat completions contract", () => {
  const body = OllamaTranslator.buildRequestBody({
    model: "gemma3:4b",
    targetLanguage: "ko",
    text: "Build reliable agents with __AL_0__."
  });

  assert.equal(body.model, "gemma3:4b");
  assert.equal(body.stream, false);
  assert.equal(body.temperature, 0);
  assert.equal(body.reasoning_effort, undefined);
  assert.match(body.messages[0].content, /Preserve every __AL_\*__/);
  assert.match(body.messages[1].content, /Target language: ko/);
  assert.match(body.messages[1].content, /__AL_0__/);
});

test("qwen3.5 short translations explicitly disable reasoning", () => {
  for (const model of ["qwen3.5:4b", "qwen3.5:9b"]) {
    const body = OllamaTranslator.buildRequestBody({ model, targetLanguage: "ko", text: "AI Foundations" });
    assert.equal(body.reasoning_effort, "none", `${model} must disable reasoning for short translation output`);
  }

  const coderBody = OllamaTranslator.buildRequestBody({
    model: "qwen2.5-coder:7b",
    targetLanguage: "ko",
    text: "AI Foundations"
  });
  assert.equal(coderBody.reasoning_effort, undefined);

  const gemma4Body = OllamaTranslator.buildRequestBody({
    model: "gemma4:12b",
    targetLanguage: "ko",
    text: "AI Foundations"
  });
  assert.equal(gemma4Body.reasoning_effort, "none");
});

test("Ollama translator posts JSON, normalizes wrappers, and returns the translation", async () => {
  let request;
  const translator = OllamaTranslator.create({
    async fetchImpl(url, options) {
      request = { url, options };
      return completion('```text\n"신뢰할 수 있는 에이전트를 구축하세요."\n```');
    }
  });

  const translated = await translator.translateText("Build reliable agents.", "ko", "gemma4:12b");
  assert.equal(translated, "신뢰할 수 있는 에이전트를 구축하세요.");
  assert.equal(request.url, "http://localhost:11434/v1/chat/completions");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["Content-Type"], "application/json");
  assert.equal(JSON.parse(request.options.body).model, "gemma4:12b");
});

test("Ollama translator sends multiple texts in one ordered JSON batch", async () => {
  const requests = [];
  const translator = OllamaTranslator.create({
    async fetchImpl(url, options) {
      requests.push({ url, body: JSON.parse(options.body) });
      return completion('```json\n["첫 번째", "두 번째"]\n```');
    }
  });

  const translated = await translator.translateTexts(["First", "Second"], "ko", "qwen3.5:4b");
  assert.deepEqual(translated, ["첫 번째", "두 번째"]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.reasoning_effort, "none");
  assert.match(requests[0].body.messages[0].content, /strict JSON array/);
  assert.match(requests[0].body.messages[1].content, /\["First","Second"\]/);
});

test("Ollama translator rejects malformed or mismatched batches", async () => {
  const malformed = OllamaTranslator.create({
    async fetchImpl() {
      return completion("not json");
    }
  });
  await assert.rejects(
    () => malformed.translateTexts(["First", "Second"], "ko", "gemma3:4b"),
    /invalid translation batch/
  );

  const mismatched = OllamaTranslator.create({
    async fetchImpl() {
      return completion('["하나"]');
    }
  });
  await assert.rejects(
    () => mismatched.translateTexts(["First", "Second"], "ko", "gemma3:4b"),
    /mismatched translation batch/
  );
});

test("Ollama translator serializes requests for a one-model, one-parallel server", async () => {
  let active = 0;
  let maxActive = 0;
  const translator = OllamaTranslator.create({
    async fetchImpl() {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return completion("번역");
    }
  });

  await Promise.all([
    translator.translateText("First", "ko", "gemma3:4b"),
    translator.translateText("Second", "ko", "gemma3:4b"),
    translator.translateText("Third", "ko", "gemma3:4b")
  ]);
  assert.equal(maxActive, 1);
});

test("Ollama translator surfaces API errors and empty responses", async () => {
  const failed = OllamaTranslator.create({
    async fetchImpl() {
      return {
        ok: false,
        status: 404,
        async json() {
          return { error: { message: "model not found" } };
        }
      };
    }
  });
  await assert.rejects(() => failed.translateText("Text", "ko", "missing:latest"), /404: model not found/);

  const empty = OllamaTranslator.create({
    async fetchImpl() {
      return completion("");
    }
  });
  await assert.rejects(() => empty.translateText("Text", "ko", "gemma3:4b"), /empty translation/);
});
