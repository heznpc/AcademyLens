const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { formatMarkdown } = require("./glossary-status.js");

const ROOT = join(__dirname, "..");
const REQUIRED_PACKAGE_SCRIPTS = [
  "release:preflight",
  "qa:live",
  "glossary:scoreboard",
  "check:glossary-status",
  "check:operations"
];
const REQUIRED_OPERATION_DOCS = [
  "docs/OPERATIONS.md",
  "docs/LIVE_QA_MANIFEST.json",
  "docs/GLOSSARY_STATUS.md",
  "docs/RELEASE_CHECKLIST.md",
  "docs/QUALITY_ROADMAP.md",
  "docs/TRUST_EVIDENCE.md",
  "TESTING.md"
];
const REQUIRED_SECURITY_WORKFLOWS = [".github/workflows/ci.yml", ".github/workflows/codeql.yml"];
const REQUIRED_SURFACES = [
  "public-course",
  "logged-in-courses",
  "logged-in-study-room",
  "live-lesson-shell",
  "nested-scorm",
  "delayed-scorm",
  "in-frame-scorm-navigation"
];
const ALLOWED_SURFACE_STATUS = new Set(["fixture-covered", "synthetic-covered", "needs-live-recapture"]);

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function readJson(path) {
  return JSON.parse(read(path));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertFile(path) {
  assert(existsSync(join(ROOT, path)), `Missing required operations file: ${path}`);
}

function assertContains(path, pattern, message) {
  assert(pattern.test(read(path)), message || `${path} missing ${pattern}`);
}

const pkg = readJson("package.json");
for (const script of REQUIRED_PACKAGE_SCRIPTS) {
  assert(pkg.scripts && pkg.scripts[script], `Missing package script: ${script}`);
}

for (const doc of REQUIRED_OPERATION_DOCS) {
  assertFile(doc);
}
for (const workflow of REQUIRED_SECURITY_WORKFLOWS) {
  assertFile(workflow);
}

const manifest = readJson("docs/LIVE_QA_MANIFEST.json");
assert(manifest.schemaVersion === 1, "LIVE_QA_MANIFEST schemaVersion must be 1");
assert(Array.isArray(manifest.surfaces), "LIVE_QA_MANIFEST must include surfaces");
assert(Array.isArray(manifest.requiredBeforeStore), "LIVE_QA_MANIFEST must include requiredBeforeStore");

for (const id of REQUIRED_SURFACES) {
  assert(manifest.requiredBeforeStore.includes(id), `LIVE_QA_MANIFEST requiredBeforeStore missing ${id}`);
  assert(
    manifest.surfaces.some((surface) => surface.id === id),
    `LIVE_QA_MANIFEST surfaces missing ${id}`
  );
}

for (const surface of manifest.surfaces) {
  assert(surface.id, "Live QA surface missing id");
  assert(surface.label, `${surface.id} missing label`);
  assert(ALLOWED_SURFACE_STATUS.has(surface.status), `${surface.id} has unknown status: ${surface.status}`);
  assert(surface.automation, `${surface.id} missing automation reference`);
  assert(surface.manualRequired === true, `${surface.id} must remain marked manualRequired before store submission`);
  assert(
    Array.isArray(surface.protectedSurfaces) && surface.protectedSurfaces.length > 0,
    `${surface.id} missing protected surfaces`
  );
  if (surface.fixture) assertFile(surface.fixture);
  if (/logged-in|lesson|study|scorm/i.test(surface.id)) {
    assert(surface.privateDataRisk !== "low", `${surface.id} should not understate private data risk`);
  }
}

assertContains("README.md", /Unofficial, not affiliated with OpenAI\./, "README must keep unofficial disclaimer");
assertContains(
  "store-assets/STORE_LISTING.md",
  /Unofficial, not affiliated with OpenAI\./,
  "Store listing must keep unofficial disclaimer"
);
assertContains("PRIVACY_POLICY.md", /translate\.googleapis\.com/, "Privacy policy must name Google Translate endpoint");
assertContains("PRIVACY_POLICY.md", /local translation cache/i, "Privacy policy must describe local cache");
assertContains("docs/OPERATIONS.md", /npm run release:preflight/, "Operations doc must document release preflight");
assertContains("docs/OPERATIONS.md", /LIVE_QA_MANIFEST\.json/, "Operations doc must reference live QA manifest");
assertContains("docs/OPERATIONS.md", /TRUST_EVIDENCE\.md/, "Operations doc must reference trust evidence");
assertContains("docs/OPERATIONS.md", /CodeQL/, "Operations doc must reference CodeQL");
assertContains("docs/OPERATIONS.md", /academy-lens\.zip\.sha256/, "Operations doc must reference zip checksum");
assertContains(
  "docs/TRUST_EVIDENCE.md",
  /Unofficial, not affiliated with OpenAI\./,
  "Trust evidence must keep unofficial disclaimer"
);
assertContains(
  "docs/TRUST_EVIDENCE.md",
  /translate\.googleapis\.com/,
  "Trust evidence must describe Google Translate fallback"
);
assertContains(
  "docs/TRUST_EVIDENCE.md",
  /Browser-native Translator API/i,
  "Trust evidence must describe browser-native provider"
);
assertContains("docs/TRUST_EVIDENCE.md", /CodeQL/, "Trust evidence must describe CodeQL coverage");
assertContains("docs/TRUST_EVIDENCE.md", /SHA-256/, "Trust evidence must describe release checksum");
assertContains(
  ".github/PULL_REQUEST_TEMPLATE.md",
  /npm run release:preflight/,
  "PR template must expose release preflight for operational changes"
);
assertContains(
  ".github/ISSUE_TEMPLATE/qa_report.yml",
  /private account details/i,
  "QA report template must warn against private account details"
);

const expectedGlossaryStatus = formatMarkdown();
assert(
  read("docs/GLOSSARY_STATUS.md") === expectedGlossaryStatus,
  "docs/GLOSSARY_STATUS.md is out of date. Run npm run glossary:scoreboard."
);

const ciWorkflow = read(".github/workflows/ci.yml");
assert(
  /actions\/checkout@v7[\s\S]*persist-credentials:\s*false/.test(ciWorkflow),
  "CI checkout must disable credential persistence"
);

const codeqlWorkflow = read(".github/workflows/codeql.yml");
assert(!/pull_request_target\s*:/.test(codeqlWorkflow), "CodeQL must not run on pull_request_target");
assert(/security-events:\s*write/.test(codeqlWorkflow), "CodeQL workflow must grant security-events write permission");
assert(
  /actions\/checkout@v7[\s\S]*persist-credentials:\s*false/.test(codeqlWorkflow),
  "CodeQL checkout must disable credential persistence"
);
assert(/github\/codeql-action\/init@v4/.test(codeqlWorkflow), "CodeQL init action must use v4");
assert(/github\/codeql-action\/analyze@v4/.test(codeqlWorkflow), "CodeQL analyze action must use v4");
assert(/languages:\s*javascript-typescript/.test(codeqlWorkflow), "CodeQL must analyze JavaScript/TypeScript");

console.log("operations checks ok");
