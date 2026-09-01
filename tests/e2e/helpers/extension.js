const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const ROOT = path.join(__dirname, "..", "..", "..");

function patchManifest(manifest, options = {}) {
  const fixtureOrigins = options.preserveOptionalProviderPermissions
    ? ["http://127.0.0.1:*/*"]
    : ["http://localhost:*/*", "http://127.0.0.1:*/*"];
  for (const contentScript of manifest.content_scripts || []) {
    contentScript.matches.push(...fixtureOrigins);
  }
  manifest.host_permissions = manifest.host_permissions || [];
  manifest.host_permissions.push(...fixtureOrigins);
  if (!options.preserveOptionalProviderPermissions) {
    manifest.host_permissions.push("https://translate.googleapis.com/*");
    manifest.optional_host_permissions = (manifest.optional_host_permissions || []).filter(
      (origin) => origin !== "https://translate.googleapis.com/*" && origin !== "http://localhost:11434/*"
    );
  }
  for (const resource of manifest.web_accessible_resources || []) {
    resource.matches.push(...fixtureOrigins);
  }
}

function patchAcademyUrlGate(extensionPath) {
  const constantsPath = path.join(extensionPath, "src", "lib", "constants.js");
  const source = fs.readFileSync(constantsPath, "utf8");
  const patched = source.replace(
    "const ACADEMY_URL_PATTERNS = Object.freeze([",
    "const ACADEMY_URL_PATTERNS = Object.freeze([/^http:\\/\\/(?:localhost|127\\.0\\.0\\.1):\\d+\\//i,"
  );
  fs.writeFileSync(constantsPath, patched);
}

function patchBrowserTranslatorStub(extensionPath, mode) {
  if (!mode) return;
  const browserTranslatorPath = path.join(extensionPath, "src", "lib", "browser-translator.js");
  const source = `
(function initAcademyLensBrowserTranslatorStub(root) {
  "use strict";
  const mode = ${JSON.stringify(mode)};
  root.AcademyLensBrowserTranslator = Object.freeze({
    PROVIDER_ID: "browser-translator-test",
    async availability(options = {}) {
      return {
        provider: "browser-translator-test",
        status: mode === "downloadable" ? "downloadable" : "available",
        sourceLanguage: options.sourceLanguage || "en",
        targetLanguage: options.targetLanguage || "ko"
      };
    },
    async translateBatch(texts, options = {}) {
      if (mode === "downloadable" && !options.allowDownload) {
        throw new Error("download disabled");
      }
      if (mode === "downloadable" && typeof options.onDownloadProgress === "function") {
        options.onDownloadProgress();
      }
      const translated = {};
      for (const text of texts || []) {
        if (mode === "partial" && /fallback/i.test(text)) continue;
        const placeholders = String(text).match(/__AL_[A-Z0-9_]+__/g) || [];
        const targetSamples = {
          ko: "네이티브 번역 문장",
          ja: "ネイティブ翻訳文",
          "zh-CN": "原生翻译句子",
          "zh-TW": "原生翻譯句子"
        };
        const valid = [targetSamples[options.targetLanguage] || "Native translated course sentence", ...placeholders]
          .join(" ")
          .trim();
        translated[text] = mode === "copy" ? text : mode === "wrong-language" ? "Unrelated English answer" : valid;
      }
      return translated;
    }
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
`;
  fs.writeFileSync(browserTranslatorPath, source);
}

function makePatchedExtension(options = {}) {
  const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "academylens-e2e-ext-"));
  for (const entry of ["manifest.json", "_locales", "assets", "src", "README.md", "PRIVACY_POLICY.md", "LICENSE"]) {
    fs.cpSync(path.join(ROOT, entry), path.join(extensionPath, entry), { recursive: true });
  }

  const manifestPath = path.join(extensionPath, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  patchManifest(manifest, options);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  patchAcademyUrlGate(extensionPath);

  return extensionPath;
}

async function launchExtension(options = {}) {
  const freshInstall = options.freshInstall === true;
  const locale = options.locale || "ko-KR";
  const extensionPath = makePatchedExtension({ preserveOptionalProviderPermissions: freshInstall });
  patchBrowserTranslatorStub(extensionPath, options.browserTranslatorStub);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "academylens-e2e-profile-"));
  const channel = process.env.E2E_BROWSER_CHANNEL || "chromium";

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel,
    headless: false,
    locale,
    ignoreDefaultArgs: options.enableBackForwardCache ? ["--disable-back-forward-cache"] : undefined,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      "--enable-unsafe-extension-debugging",
      "--no-first-run",
      "--no-default-browser-check",
      `--lang=${locale}`
    ]
  });

  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 5000 }).catch(() => null);
  }
  if (serviceWorker && !freshInstall) {
    const translationEngine = options.translationEngine || (options.browserTranslatorStub ? "device" : "remote");
    await serviceWorker.evaluate(async (translationEngine) => {
      await chrome.storage.local.set({
        "academylens.settings": {
          targetLanguage: "ko",
          autoTranslate: false,
          enableBrowserTranslatorDownloads: false,
          translationEngine,
          ollamaModel: "qwen3.5:4b"
        }
      });
    }, translationEngine);
  }

  return {
    context,
    extensionId: serviceWorker ? serviceWorker.url().split("/")[2] : null,
    extensionPath,
    serviceWorker,
    userDataDir
  };
}

async function waitForExtensionServiceWorker(state, timeout = 5000) {
  const prefix = `chrome-extension://${state.extensionId}/`;
  for (const current of state.context.serviceWorkers().filter((worker) => worker.url().startsWith(prefix))) {
    try {
      await current.evaluate(() => chrome.runtime.id);
      state.serviceWorker = current;
      return current;
    } catch {
      // Playwright can retain a closed Worker handle briefly after MV3 suspension.
    }
  }
  const worker = await state.context.waitForEvent("serviceworker", {
    predicate: (candidate) => candidate.url().startsWith(prefix),
    timeout
  });
  state.serviceWorker = worker;
  return worker;
}

async function stopExtensionServiceWorker(state) {
  await waitForExtensionServiceWorker(state);
  const browser = state.context.browser();
  if (!browser) throw new Error("Chromium browser connection is unavailable");

  const session = await browser.newBrowserCDPSession();
  try {
    const { targetInfos } = await session.send("Target.getTargets");
    const target = targetInfos.find(
      (candidate) =>
        candidate.type === "service_worker" && candidate.url.startsWith(`chrome-extension://${state.extensionId}/`)
    );
    if (!target) throw new Error("AcademyLens service worker target was not found");

    await session.send("Target.closeTarget", { targetId: target.targetId });
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const current = await session.send("Target.getTargets");
      if (!current.targetInfos.some((candidate) => candidate.targetId === target.targetId)) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const remaining = await session.send("Target.getTargets");
    if (remaining.targetInfos.some((candidate) => candidate.targetId === target.targetId)) {
      throw new Error("AcademyLens service worker did not stop");
    }
    state.serviceWorker = null;
  } finally {
    await session.detach();
  }
}

async function closeExtension(state) {
  try {
    await state.context.close();
  } finally {
    for (const dir of [state.extensionPath, state.userDataDir]) {
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

module.exports = {
  closeExtension,
  launchExtension,
  stopExtensionServiceWorker,
  waitForExtensionServiceWorker
};
