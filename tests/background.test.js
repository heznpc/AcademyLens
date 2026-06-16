const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = join(__dirname, "..");

function response(status, translated) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return [[translated ? [translated, "", null, null] : []]];
    }
  };
}

function loadBackground(fetchImpl) {
  const listeners = [];
  const storage = {};
  const context = {
    AbortController,
    URL,
    clearTimeout,
    console,
    fetch: fetchImpl,
    setTimeout,
    chrome: {
      storage: {
        local: {
          async get(keys) {
            if (Array.isArray(keys)) {
              return Object.fromEntries(keys.map((key) => [key, storage[key]]));
            }
            return { [keys]: storage[keys] };
          },
          async set(values) {
            Object.assign(storage, values);
          }
        }
      },
      runtime: {
        onMessage: {
          addListener(listener) {
            listeners.push(listener);
          }
        }
      }
    }
  };
  context.self = context;
  context.globalThis = context;
  context.importScripts = (...scripts) => {
    for (const script of scripts) {
      const fullPath = resolve(ROOT, "src/background", script);
      vm.runInContext(readFileSync(fullPath, "utf8"), context, { filename: fullPath });
    }
  };
  vm.createContext(context);
  vm.runInContext(readFileSync(join(ROOT, "src/background/background.js"), "utf8"), context, {
    filename: "src/background/background.js"
  });

  async function send(message) {
    assert.equal(listeners.length, 1);
    return new Promise((resolveResponse) => {
      listeners[0](message, {}, resolveResponse);
    });
  }

  return { send, storage };
}

test("background translation retries transient failures", async () => {
  let calls = 0;
  const { send } = loadBackground(async () => {
    calls += 1;
    return calls === 1 ? response(503) : response(200, "AI 기초");
  });

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    targetLanguage: "ko",
    texts: ["AI Foundations"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.translated["AI Foundations"], "AI 기초");
  assert.equal(calls, 2);
});

test("background translation returns partial success with per-text errors", async () => {
  const { send } = loadBackground(async (url) => {
    const text = new URL(url).searchParams.get("q");
    return text === "Broken text" ? response(500) : response(200, `${text} translated`);
  });

  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    targetLanguage: "ko",
    texts: ["Good text", "Broken text"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.translated["Good text"], "Good text translated");
  assert.match(result.errors["Broken text"], /500/);
  assert.equal(result.stats.failed, 1);
});

test("background translation dedupes in-flight requests across batches", async () => {
  let calls = 0;
  let release;
  const blocker = new Promise((resolveBlocker) => {
    release = resolveBlocker;
  });
  const { send } = loadBackground(async () => {
    calls += 1;
    await blocker;
    return response(200, "공유 번역");
  });

  const first = send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    targetLanguage: "ko",
    texts: ["Shared text"]
  });
  const second = send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    targetLanguage: "ko",
    texts: ["Shared text"]
  });
  release();

  const results = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(results[0].translated["Shared text"], "공유 번역");
  assert.equal(results[1].translated["Shared text"], "공유 번역");
});

test("background translation limits concurrent remote fetches", async () => {
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const { send } = loadBackground(async (url) => {
    calls += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
    const text = new URL(url).searchParams.get("q");
    return response(200, `${text} translated`);
  });

  const texts = Array.from({ length: 12 }, (_, index) => `Text ${index}`);
  const result = await send({
    type: "ACADEMYLENS_TRANSLATE_BATCH",
    targetLanguage: "ko",
    texts
  });

  assert.equal(result.ok, true);
  assert.equal(calls, 12);
  assert(maxActive <= 5, `expected max concurrency <= 5, got ${maxActive}`);
});
