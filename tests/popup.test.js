const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const Constants = require("../src/lib/constants.js");

const ROOT = join(__dirname, "..");
const popupHtml = readFileSync(join(ROOT, "src/popup/popup.html"), "utf8");
const popupSource = readFileSync(join(ROOT, "src/popup/popup.js"), "utf8");

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function waitUntil(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await flush();
  }
  assert.fail("Timed out waiting for popup state");
}

async function loadPopup(options = {}) {
  const dom = new JSDOM(popupHtml, { runScripts: "outside-only", url: "chrome-extension://test/src/popup/popup.html" });
  const { window } = dom;
  const stored = options.settings ? { [Constants.STORAGE_KEYS.SETTINGS]: options.settings } : {};
  const permissionRequests = [];
  const runtimeMessages = [];

  Object.defineProperty(window.navigator, "language", { value: "ko-KR", configurable: true });
  Object.defineProperty(window.navigator, "languages", { value: ["ko-KR", "en-US"], configurable: true });
  window.AcademyLensConstants = Constants;
  window.fetch = async () => ({
    ok: true,
    async json() {
      return { glossaries: [] };
    }
  });
  window.chrome = {
    runtime: {
      getURL(path) {
        return `chrome-extension://test/${path}`;
      },
      async sendMessage(message) {
        runtimeMessages.push(message);
        if (typeof options.ollamaHealth === "function") return options.ollamaHealth(message);
        return (
          options.ollamaHealth || {
            ok: true,
            status: "ready",
            model: message.ollamaModel,
            models: [message.ollamaModel]
          }
        );
      }
    },
    storage: {
      local: {
        async get() {
          return { ...stored };
        },
        async set(values) {
          Object.assign(stored, values);
        }
      }
    },
    permissions: {
      async contains(details) {
        if (typeof options.permissionContains === "function") return options.permissionContains(details);
        return false;
      },
      async request(details) {
        permissionRequests.push(details);
        if (typeof options.permissionRequest === "function") return options.permissionRequest(details);
        return options.permissionGranted !== false;
      }
    }
  };

  window.eval(popupSource);
  await flush();
  return { dom, permissionRequests, runtimeMessages, stored, window };
}

test("popup exposes every allowlisted Ollama model and persists the selection", async () => {
  const { permissionRequests, stored, window } = await loadPopup();
  const engine = window.document.getElementById("translationEngine");
  const model = window.document.getElementById("ollamaModel");
  const modelField = window.document.getElementById("ollamaModelField");

  assert.deepEqual(
    Array.from(model.options, (option) => option.value),
    Constants.OLLAMA_MODELS
  );
  assert.equal(model.value, "qwen3.5:4b");
  assert.equal(modelField.hidden, true);

  engine.value = "ollama";
  engine.dispatchEvent(new window.Event("change"));
  await flush();
  assert.equal(modelField.hidden, false);
  assert.equal(permissionRequests.length, 1);
  assert.equal(permissionRequests[0].origins[0], "http://localhost:11434/*");
  assert.equal(stored[Constants.STORAGE_KEYS.SETTINGS].translationEngine, "ollama");
  assert.match(window.document.getElementById("ollamaStatus").textContent, /준비됐습니다/);

  model.value = "gemma4:12b";
  model.dispatchEvent(new window.Event("change"));
  await flush();
  assert.equal(stored[Constants.STORAGE_KEYS.SETTINGS].ollamaModel, "gemma4:12b");
});

test("popup removes auto without requesting permission and migrates stored auto to device", async () => {
  const { permissionRequests, stored, window } = await loadPopup({
    settings: { ...Constants.DEFAULT_SETTINGS, targetLanguage: "ko", translationEngine: "auto" }
  });
  const engine = window.document.getElementById("translationEngine");

  assert.deepEqual(
    Array.from(engine.options, (option) => option.value),
    ["device", "remote", "ollama"]
  );
  assert.equal(engine.value, "device");
  assert.equal(stored[Constants.STORAGE_KEYS.SETTINGS].translationEngine, "device");
  assert.equal(permissionRequests.length, 0);
});

test("popup stores Google remote only after the exact optional permission is granted", async () => {
  const { permissionRequests, stored, window } = await loadPopup();
  const engine = window.document.getElementById("translationEngine");

  engine.value = "remote";
  engine.dispatchEvent(new window.Event("change"));
  await flush();

  assert.equal(permissionRequests.length, 1);
  assert.deepEqual(Array.from(permissionRequests[0].origins), [Constants.REMOTE_TRANSLATION_ORIGIN]);
  assert.equal(engine.value, "remote");
  assert.equal(stored[Constants.STORAGE_KEYS.SETTINGS].translationEngine, "remote");
});

test("popup restores device when the Google remote permission is declined", async () => {
  const { permissionRequests, stored, window } = await loadPopup({ permissionGranted: false });
  const engine = window.document.getElementById("translationEngine");

  engine.value = "remote";
  engine.dispatchEvent(new window.Event("change"));
  await flush();

  assert.equal(permissionRequests.length, 1);
  assert.deepEqual(Array.from(permissionRequests[0].origins), [Constants.REMOTE_TRANSLATION_ORIGIN]);
  assert.equal(engine.value, "device");
  assert.equal(stored[Constants.STORAGE_KEYS.SETTINGS].translationEngine, "device");
  assert.match(window.document.getElementById("engineNote").textContent, /권한이 거부/);
});

test("popup reports an offline Ollama server and can retry", async () => {
  const { runtimeMessages, window } = await loadPopup({
    settings: { ...Constants.DEFAULT_SETTINGS, targetLanguage: "ko", translationEngine: "ollama" },
    ollamaHealth: { ok: false, status: "offline", models: [] }
  });

  assert.match(window.document.getElementById("ollamaStatus").textContent, /응답하지 않습니다/);
  window.document.getElementById("ollamaRetry").click();
  await flush();
  assert.equal(runtimeMessages.filter((message) => message.type === Constants.MESSAGE_TYPES.CHECK_OLLAMA).length, 2);
});

test("popup fails closed when localhost permission is declined", async () => {
  const { stored, window } = await loadPopup({ permissionGranted: false });
  const engine = window.document.getElementById("translationEngine");

  engine.value = "ollama";
  engine.dispatchEvent(new window.Event("change"));
  await flush();

  assert.equal(engine.value, "device");
  assert.equal(stored[Constants.STORAGE_KEYS.SETTINGS].translationEngine, "device");
  assert.match(window.document.getElementById("engineNote").textContent, /권한이 거부/);
});

test("popup fails closed when Chrome rejects the optional permission request", async () => {
  const { stored, window } = await loadPopup({
    permissionRequest() {
      throw new Error("permission prompt unavailable");
    }
  });
  const engine = window.document.getElementById("translationEngine");

  engine.value = "remote";
  engine.dispatchEvent(new window.Event("change"));
  await flush();

  assert.equal(engine.value, "device");
  assert.equal(stored[Constants.STORAGE_KEYS.SETTINGS].translationEngine, "device");
  assert.match(window.document.getElementById("engineNote").textContent, /권한이 거부/);
});

test("popup ignores a stale permission lookup after the learner returns to device", async () => {
  const lookup = deferred();
  let containsCalls = 0;
  const { permissionRequests, stored, window } = await loadPopup({
    permissionContains(details) {
      containsCalls += 1;
      if (details.origins[0] === Constants.REMOTE_TRANSLATION_ORIGIN) return lookup.promise;
      return false;
    }
  });
  const engine = window.document.getElementById("translationEngine");

  engine.value = "remote";
  engine.dispatchEvent(new window.Event("change"));
  await waitUntil(() => containsCalls === 1);

  engine.value = "device";
  engine.dispatchEvent(new window.Event("change"));
  await flush();
  lookup.resolve(false);
  await flush();

  assert.equal(engine.value, "device");
  assert.equal(stored[Constants.STORAGE_KEYS.SETTINGS].translationEngine, "device");
  assert.equal(permissionRequests.length, 0);
});

test("popup ignores a stale granted permission after the learner returns to device", async () => {
  const request = deferred();
  const { permissionRequests, stored, window } = await loadPopup({
    permissionRequest() {
      return request.promise;
    }
  });
  const engine = window.document.getElementById("translationEngine");

  engine.value = "remote";
  engine.dispatchEvent(new window.Event("change"));
  await waitUntil(() => permissionRequests.length === 1);

  engine.value = "device";
  engine.dispatchEvent(new window.Event("change"));
  await flush();
  request.resolve(true);
  await flush();

  assert.equal(engine.value, "device");
  assert.equal(stored[Constants.STORAGE_KEYS.SETTINGS].translationEngine, "device");
  assert.match(window.document.getElementById("engineNote").textContent, /기기 안에서 번역/);
});

test("popup ignores an older Ollama health result after the model changes", async () => {
  const firstModelHealth = deferred();
  const secondModelHealth = deferred();
  const { runtimeMessages, stored, window } = await loadPopup({
    settings: { ...Constants.DEFAULT_SETTINGS, targetLanguage: "ko", translationEngine: "ollama" },
    ollamaHealth(message) {
      if (message.ollamaModel === "gemma3:4b") return firstModelHealth.promise;
      if (message.ollamaModel === "gemma4:12b") return secondModelHealth.promise;
      return { ok: true, status: "ready", model: message.ollamaModel, models: [message.ollamaModel] };
    }
  });
  const model = window.document.getElementById("ollamaModel");
  const status = window.document.getElementById("ollamaStatus");

  model.value = "gemma3:4b";
  model.dispatchEvent(new window.Event("change"));
  await waitUntil(() => runtimeMessages.some((message) => message.ollamaModel === "gemma3:4b"));

  model.value = "gemma4:12b";
  model.dispatchEvent(new window.Event("change"));
  await waitUntil(() => runtimeMessages.some((message) => message.ollamaModel === "gemma4:12b"));

  secondModelHealth.resolve({ ok: true, status: "ready", model: "gemma4:12b", models: ["gemma4:12b"] });
  await flush();
  firstModelHealth.resolve({ ok: false, status: "offline", model: "gemma3:4b", models: [] });
  await flush();

  assert.equal(stored[Constants.STORAGE_KEYS.SETTINGS].ollamaModel, "gemma4:12b");
  assert.match(status.textContent, /gemma4:12b/);
  assert.doesNotMatch(status.textContent, /응답하지 않습니다/);
  assert.equal(window.document.getElementById("ollamaRetry").disabled, false);
});
