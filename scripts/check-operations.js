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
  "TESTING.md"
];
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

console.log("operations checks ok");
