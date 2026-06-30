const assert = require("node:assert/strict");
const { readFileSync, readdirSync, statSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const ROOT = join(__dirname, "..");

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function listRuntimeFiles(dir) {
  const root = join(ROOT, dir);
  const out = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    const rel = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) out.push(...listRuntimeFiles(rel));
    else if (/\.(js|html|json)$/i.test(entry)) out.push(rel);
  }
  return out;
}

test("content translation fallback does not race background translation by default", () => {
  const source = read("src/content/content.js");
  const sendBackgroundTranslationBatch = source.slice(
    source.indexOf("async function sendBackgroundTranslationBatch"),
    source.indexOf(
      "async function sendTranslationBatch",
      source.indexOf("async function sendBackgroundTranslationBatch")
    )
  );
  const sendTranslationBatch = source.slice(
    source.indexOf("async function sendTranslationBatch"),
    source.indexOf("function message", source.indexOf("async function sendTranslationBatch"))
  );

  assert(!source.includes("BACKGROUND_FALLBACK_DELAY_MS"));
  assert(!sendBackgroundTranslationBatch.includes("Promise.race"));
  assert.match(sendBackgroundTranslationBatch, /await sendMessage/);
  assert.match(sendBackgroundTranslationBatch, /BACKGROUND_RESPONSE_MAX_TIMEOUT_MS/);
  assert.match(sendBackgroundTranslationBatch, /BACKGROUND_TIMEOUT_CODE/);
  assert.match(sendBackgroundTranslationBatch, /throw error/);
  assert.match(sendBackgroundTranslationBatch, /translateBatchInContent/);
  assert.match(sendTranslationBatch, /translateBatchWithBrowserTranslator/);
  assert.match(sendTranslationBatch, /sendBackgroundTranslationBatch/);
});

test("content translation fallback has retry, timeout, dedupe, and concurrency controls", () => {
  const source = read("src/content/content.js");
  const fallback = source.slice(
    source.indexOf("async function fetchContentTranslationWithRetry"),
    source.indexOf("async function persistContentCache")
  );

  assert.match(source, /CONTENT_FALLBACK_MAX_CONCURRENT_FETCHES = 5/);
  assert.match(source, /contentFallbackInFlight/);
  assert.match(fallback, /AbortController/);
  assert.match(fallback, /RETRYABLE_TRANSLATE_STATUS/);
  assert.match(fallback, /runWithContentFallbackFetchLimit/);
});

test("browser translator provider only runs when already available", () => {
  const source = read("src/content/content.js");
  const provider = source.slice(
    source.indexOf("async function translateBatchWithBrowserTranslator"),
    source.indexOf("async function sendBackgroundTranslationBatch")
  );

  assert.match(provider, /support\.status !== "available"/);
  assert.match(provider, /allowDownload: false/);
  assert.match(provider, /cacheHasTranslation/);
  assert.match(provider, /persistContentCache/);
});

test("content translation keeps scanning bounded passes beyond one node cap", () => {
  const constants = read("src/lib/constants.js");
  const source = read("src/content/content.js");
  const translatePage = source.slice(
    source.indexOf("async function translatePage"),
    source.indexOf("function restorePage", source.indexOf("async function translatePage"))
  );

  assert.match(constants, /maxTranslationPasses: 8/);
  assert.match(source, /async function translateCandidatePass/);
  assert.match(translatePage, /for \(let passIndex = 0; passIndex < maxPasses; passIndex \+= 1\)/);
  assert.match(translatePage, /result\.reachedLimit/);
  assert.match(translatePage, /status\.translatedCapped/);
});

test("content mutation and placement work is throttled before expensive page scans", () => {
  const source = read("src/content/content.js");
  const updatePanelPlacement = source.slice(
    source.indexOf("function updatePanelPlacement"),
    source.indexOf("function requestPanelPlacementFrame")
  );

  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /mutationMayContain|elementMayContainTranslatableText/);
  assert.match(source, /collectPanelOverlayCandidates/);
  assert.doesNotMatch(updatePanelPlacement, /querySelectorAll\("\*"\)/);
});

test("live DOM capture reports redactions and blocks risky fixture writes", () => {
  const source = read("scripts/capture-academy-dom.js");

  assert.match(source, /PII_TEXT_REDACTIONS/);
  assert.match(source, /redactionReport/);
  assert.match(source, /residualRiskMatches/);
  assert.match(source, /Refusing fixture write because residual sensitive patterns remain/);
});

test("store screenshot capture only accepts routes with explicit assertions", () => {
  const source = read("scripts/capture-store-screenshots.js");

  assert.match(source, /SCREENSHOT_ROUTES/);
  assert.match(source, /Unsupported screenshot path/);
  assert.match(source, /waitForText/);
  assert.match(source, /\/logged-in-courses/);
  assert.match(source, /\/study-room/);
});

test("privacy policy describes local cache contents and auto-translate behavior", () => {
  const policy = read("PRIVACY_POLICY.md");

  assert.match(policy, /auto-translate is enabled/i);
  assert.match(policy, /newly rendered visible lesson text/i);
  assert.match(policy, /cached original visible text/i);
  assert.match(policy, /cached translated text/i);
  assert.match(policy, /target language, creation time, and last-access time/i);
});

test("runtime cannot inherit Puter app identity or auth state", () => {
  const runtimeFiles = ["manifest.json", ...listRuntimeFiles("src")];

  for (const file of runtimeFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /js\.puter\.com/i, `${file} must not load Puter.js`);
    assert.doesNotMatch(source, /\b(?:window|globalThis|self)\.puter\b/i, `${file} must not read a Puter global`);
    assert.doesNotMatch(source, /\bputer\.ai\b/i, `${file} must not call Puter AI`);
    assert.doesNotMatch(
      source,
      /\bputer\.(?:app\.(?:id|name)|auth\.token)\b/i,
      `${file} must not read or write Puter app/auth identity keys`
    );
  }
});
