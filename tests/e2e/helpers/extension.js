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

function makePatchedExtension() {
  const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "academylens-e2e-ext-"));
  for (const entry of ["manifest.json", "assets", "src", "README.md", "PRIVACY_POLICY.md"]) {
    fs.cpSync(path.join(ROOT, entry), path.join(extensionPath, entry), { recursive: true });
  }

  const manifestPath = path.join(extensionPath, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  patchManifest(manifest);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  patchAcademyUrlGate(extensionPath);

  return extensionPath;
}

async function launchExtension() {
  const extensionPath = makePatchedExtension();
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

  const [serviceWorker] = context.serviceWorkers();

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
