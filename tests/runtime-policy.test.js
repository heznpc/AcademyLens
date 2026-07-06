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
  assert.match(source, /currentAbortSignal/);
  assert.match(source, /throwIfAborted/);
});

test("browser translator provider only runs when already available", () => {
  const source = read("src/content/content.js");
  const provider = source.slice(
    source.indexOf("async function translateBatchWithBrowserTranslator"),
    source.indexOf("async function sendBackgroundTranslationBatch")
  );

  assert.match(provider, /const canUseBrowserTranslator/);
  assert.match(provider, /!canUseBrowserTranslator/);
  assert.match(provider, /allowDownload: Boolean\(state\.settings\.enableBrowserTranslatorDownloads\)/);
  assert.match(provider, /translationLooksSuspicious/);
  assert.match(provider, /cacheHasTranslation/);
  assert.match(provider, /persistContentCache/);
  assert.match(provider, /ok: stats\.failed === 0 \|\| Object\.keys\(translated\)\.length > 0/);
});

test("browser translator downloads require explicit user opt-in", () => {
  const source = read("src/content/content.js");
  const provider = source.slice(
    source.indexOf("async function translateBatchWithBrowserTranslator"),
    source.indexOf("async function sendBackgroundTranslationBatch")
  );
  const constants = read("src/lib/constants.js");

  assert.match(constants, /enableBrowserTranslatorDownloads: false/);
  assert.match(provider, /state\.settings\.enableBrowserTranslatorDownloads/);
  assert.match(provider, /support\.status === "downloadable"/);
  assert.match(provider, /allowDownload: Boolean\(state\.settings\.enableBrowserTranslatorDownloads\)/);
  assert.match(source, /data-native-download/);
  assert.match(source, /data-provider-chip/);
});

test("content translation keeps scanning bounded passes beyond one node cap", () => {
  const constants = read("src/lib/constants.js");
  const source = read("src/content/content.js");
  const translatePage = source.slice(
    source.indexOf("async function performTranslatePage"),
    source.indexOf("function restorePage", source.indexOf("async function performTranslatePage"))
  );

  assert.match(constants, /maxTranslationPasses: 8/);
  assert.match(constants, /maxCandidateScanNodes: 600/);
  assert.match(source, /async function translateCandidatePass/);
  assert.match(source, /scoreNode\(node\)/);
  assert.match(translatePage, /for \(let passIndex = 0; passIndex < maxPasses; passIndex \+= 1\)/);
  assert.match(translatePage, /result\.reachedLimit/);
  assert.match(translatePage, /status\.translatedCapped/);
});

test("content translation uses a queue for manual, auto, and frame requests", () => {
  const source = read("src/content/content.js");

  assert.match(source, /translationQueue/);
  assert.match(source, /function enqueueTranslation/);
  assert.match(source, /async function runTranslationQueue/);
  assert.match(source, /async function performTranslatePage/);
  assert.match(source, /function translatePage\(options = \{\}\)/);
  assert.match(source, /scheduleAutoTranslate\(delay\)/);
  assert.match(source, /window\.clearTimeout\(state\.debounceTimer\)/);
});

test("content supports local corrections, frame aggregation, viewport priority, and inline tokens", () => {
  const source = read("src/content/content.js");
  const constants = read("src/lib/constants.js");

  assert.match(constants, /CORRECTIONS: "academylens\.localCorrections\.v1"/);
  assert.match(source, /function persistCorrection/);
  assert.match(source, /function deleteCorrection/);
  assert.match(source, /function refreshCorrectionRecords/);
  assert.match(source, /function updateCorrectionsManager/);
  assert.match(source, /function correctionFor/);
  assert.match(source, /function startFrameAggregate/);
  assert.match(source, /cleanupTimer/);
  assert.match(source, /status\.translatedWithFrames/);
  assert.match(source, /status\.frameFailed/);
  assert.match(source, /function sortCandidatesByViewport/);
  assert.match(source, /function prepareInlinePlaceholders/);
  assert.match(source, /function candidateContextKey/);
  assert.match(source, /function updateDiagnosticsPanel/);
  assert.match(source, /preparedByCandidate/);
  assert.match(source, /__AL_INLINE_/);
});

test("content cache scope tracks provider and glossary while cache clears invalidate stale writes", () => {
  const source = read("src/content/content.js");
  const constants = read("src/lib/constants.js");
  const cache = read("src/lib/cache.js");
  const background = read("src/background/background.js");

  assert.match(constants, /CACHE_EPOCH: "academylens\.translationCacheEpoch\.v1"/);
  assert.match(constants, /PERSIST_CACHE_UPDATES: "ACADEMYLENS_PERSIST_CACHE_UPDATES"/);
  assert.match(cache, /function normalizeScope/);
  assert.match(cache, /function entryMatches/);
  assert.match(source, /function glossarySignature/);
  assert.match(source, /function cacheScope/);
  assert.match(source, /function cacheEpochValue/);
  assert.match(source, /state\.cacheEpoch/);
  assert.match(source, /cacheEpoch: state\.cacheEpoch/);
  assert.match(source, /provider: "google-translate"/);
  assert.match(source, /type: C\.MESSAGE_TYPES\.PERSIST_CACHE_UPDATES/);
  assert.match(background, /function googleCacheScope/);
  assert.match(background, /async function persistCacheUpdates/);
  assert.match(background, /message\.type === MESSAGE_TYPES\.PERSIST_CACHE_UPDATES/);
  assert.match(background, /expectedCacheEpoch/);
});

test("content fallback only retries texts missed by browser-native translation", () => {
  const source = read("src/content/content.js");
  const sendTranslationBatch = source.slice(
    source.indexOf("async function sendTranslationBatch"),
    source.indexOf("function message", source.indexOf("async function sendTranslationBatch"))
  );

  assert.match(source, /function untranslatedTexts/);
  assert.match(source, /function mergeTranslationResponses/);
  assert.match(source, /function hasUnexpectedPlaceholderTokens/);
  assert.match(sendTranslationBatch, /const missingTexts = untranslatedTexts\(requestedTexts, browserResponse\)/);
  assert.match(sendTranslationBatch, /texts: missingTexts/);
});

test("frame commands are scoped to the current route before redispatch", () => {
  const source = read("src/content/content.js");

  assert.match(source, /routeVersion/);
  assert.match(source, /pageUrl: extra\.pageUrl \|\| location\.href/);
  assert.match(source, /frameToken: extra\.frameToken/);
  assert.match(source, /function isTrustedParentFrameCommand/);
  assert.match(source, /event\.source !== window\.parent/);
  assert.match(source, /data\.frameToken !== state\.frameSessionToken/);
  assert.match(source, /function isKnownChildFrameSource/);
  assert.match(source, /function isPendingFrameCommandCurrent/);
  assert.match(source, /function clearFrameAggregates/);
});

test("panel status is exposed as an accessible live region", () => {
  const source = read("src/content/content.js");

  assert.match(source, /data-status role="status" aria-live="polite" aria-atomic="true"/);
});

test("content mutation and placement work is throttled before expensive page scans", () => {
  const source = read("src/content/content.js");
  const updatePanelPlacement = source.slice(
    source.indexOf("function updatePanelPlacement"),
    source.indexOf("function requestPanelPlacementFrame")
  );

  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /queueMutationScan/);
  assert.match(source, /runMutationScan/);
  assert.match(source, /elementMayContainTranslatableText/);
  assert.match(source, /collectPanelOverlayCandidates/);
  assert.doesNotMatch(updatePanelPlacement, /querySelectorAll\("\*"\)/);
});

test("CI runs the release preflight gate", () => {
  const ci = read(".github/workflows/ci.yml");
  const pkg = JSON.parse(read("package.json"));

  assert.match(ci, /npm run release:preflight/);
  assert.match(ci, /actions\/checkout@v7[\s\S]*persist-credentials:\s*false/);
  assert.match(pkg.scripts["check:all"], /check:glossary-quality/);
});

test("GitHub security workflow runs CodeQL with least privilege", () => {
  const codeql = read(".github/workflows/codeql.yml");

  assert.match(codeql, /pull_request:/);
  assert.match(codeql, /push:[\s\S]*branches: \[main\]/);
  assert.match(codeql, /security-events:\s*write/);
  assert.match(codeql, /contents:\s*read/);
  assert.match(codeql, /actions\/checkout@v7[\s\S]*persist-credentials:\s*false/);
  assert.match(codeql, /github\/codeql-action\/init@v4/);
  assert.match(codeql, /languages:\s*javascript-typescript/);
  assert.match(codeql, /github\/codeql-action\/analyze@v4/);
  assert.doesNotMatch(codeql, /pull_request_target\s*:/);
});

test("extension manifest keeps a narrow permission, host, CSP, and WER surface", () => {
  const manifest = JSON.parse(read("manifest.json"));

  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://academy.openai.com/*", "https://translate.googleapis.com/*"]);
  assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self'; object-src 'self';");

  for (const contentScript of manifest.content_scripts) {
    assert.deepEqual(contentScript.matches, ["https://academy.openai.com/*"]);
  }

  assert.equal(manifest.web_accessible_resources.length, 1);
  assert.deepEqual(manifest.web_accessible_resources[0].resources, ["src/data/*.json", "assets/icons/*"]);
  assert.deepEqual(manifest.web_accessible_resources[0].matches, ["https://academy.openai.com/*"]);
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
  const storeListing = read("store-assets/STORE_LISTING.md");

  assert.match(policy, /auto-translate is enabled/i);
  assert.match(policy, /newly rendered visible lesson text/i);
  assert.match(policy, /browser-native Translator API/i);
  assert.match(policy, /translator downloads are disabled unless you explicitly turn them on/i);
  assert.match(policy, /local correction overrides/i);
  assert.match(policy, /locally corrected original visible text/i);
  assert.match(policy, /cached original visible text/i);
  assert.match(policy, /cached translated text/i);
  assert.match(policy, /extension-selected visible lesson text/i);
  assert.match(policy, /provider, glossary state/i);
  assert.match(policy, /diagnostics are displayed locally/i);
  assert.match(policy, /do not include the translated page text/i);
  assert.match(policy, /target language, creation time, and last-access time/i);
  assert.match(storeListing, /browser-native Translator API/i);
  assert.match(storeListing, /translate\.googleapis\.com/i);
  assert.match(storeListing, /Browser-managed translator downloads stay off unless the user explicitly enables them/i);
});

test("trust evidence page summarizes release proof and known gaps", () => {
  const source = read("docs/TRUST_EVIDENCE.md");

  assert.match(source, /Unofficial, not affiliated with OpenAI\./);
  assert.match(source, /Browser-native Translator API/);
  assert.match(source, /translate\.googleapis\.com/);
  assert.match(source, /docs\/LIVE_QA_MANIFEST\.json/);
  assert.match(source, /npm run release:preflight/);
  assert.match(source, /Current Known Gaps/);
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
