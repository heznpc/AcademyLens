const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const ROOT = path.join(__dirname, "..", "..", "..");

function patchManifest(manifest) {
  for (const contentScript of manifest.content_scripts || []) {
    contentScript.matches.push("http://localhost:*/*", "http://127.0.0.1:*/*");
  }
  manifest.host_permissions = manifest.host_permissions || [];
  manifest.host_permissions.push("http://localhost:*/*", "http://127.0.0.1:*/*");
  for (const resource of manifest.web_accessible_resources || []) {
    resource.matches.push("http://localhost:*/*", "http://127.0.0.1:*/*");
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
        translated[text] = mode === "copy" ? text : "[native] " + text;
      }
      return translated;
    }
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
`;
  fs.writeFileSync(browserTranslatorPath, source);
}

function makePatchedExtension() {
  const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "academylens-e2e-ext-"));
  for (const entry of ["manifest.json", "assets", "src", "README.md", "PRIVACY_POLICY.md", "LICENSE"]) {
    fs.cpSync(path.join(ROOT, entry), path.join(extensionPath, entry), { recursive: true });
  }

  const manifestPath = path.join(extensionPath, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  patchManifest(manifest);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  patchAcademyUrlGate(extensionPath);

  return extensionPath;
}

async function launchExtension(options = {}) {
  const extensionPath = makePatchedExtension();
  patchBrowserTranslatorStub(extensionPath, options.browserTranslatorStub);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "academylens-e2e-profile-"));
  const channel = process.env.E2E_BROWSER_CHANNEL || "chromium";

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel,
    headless: false,
    locale: "ko-KR",
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      "--enable-unsafe-extension-debugging",
      "--no-first-run",
      "--no-default-browser-check",
      "--lang=ko-KR"
    ]
  });

  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 5000 }).catch(() => null);
  }

  return {
    context,
    extensionId: serviceWorker ? serviceWorker.url().split("/")[2] : null,
    extensionPath,
    userDataDir
  };
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
  launchExtension
};
