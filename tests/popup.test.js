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

async function loadPopup(options = {}) {
  const dom = new JSDOM(popupHtml, { runScripts: "outside-only", url: "chrome-extension://test/src/popup/popup.html" });
  const { window } = dom;
  const stored = options.settings ? { [Constants.STORAGE_KEYS.SETTINGS]: options.settings } : {};
  const permissionRequests = [];

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
      async contains() {
        return false;
      },
      async request(details) {
        permissionRequests.push(details);
        return options.permissionGranted !== false;
      }
    }
  };

  window.eval(popupSource);
  await flush();
  return { dom, permissionRequests, stored, window };
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

  model.value = "gemma4:12b";
  model.dispatchEvent(new window.Event("change"));
  await flush();
  assert.equal(stored[Constants.STORAGE_KEYS.SETTINGS].ollamaModel, "gemma4:12b");
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
