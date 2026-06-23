const { existsSync, readdirSync, readFileSync, statSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const { dirname, join } = require("node:path");
const { collectEntries } = require("./build-zip.js");
const { PREMIUM_LOCALE_RECORDS } = require("./lib/glossary-config.js");

const ROOT = join(__dirname, "..");
const REQUIRED_PACKAGE_SCRIPTS = [
  "test",
  "test:e2e",
  "lint",
  "format",
  "format:check",
  "node-check",
  "capture:academy",
  "glossary:audit",
  "glossary:seed",
  "glossary:status",
  "check:manifest",
  "check:glossary",
  "check:glossary-overreach",
  "check:files",
  "check:all",
  "build:zip",
  "check:full"
];
const REQUIRED_PROTECTED_TERMS = [
  "OpenAI",
  "OpenAI Academy",
  "ChatGPT",
  "GPT",
  "GPT-5",
  "GPT-4",
  "LLM",
  "API",
  "SDK",
  "JSON",
  "JSON Schema",
  "Responses API",
  "Agents SDK",
  "Gradual",
  "Google Translate"
];
const REQUIRED_GITIGNORE_PATTERNS = [
  "node_modules/",
  "dist/",
  "test-results/",
  "playwright-report/",
  ".chrome-profile/",
  ".env",
  ".env.*",
  "!.env.example",
  "*.zip",
  "*.crx",
  "*.pem",
  "*.trace",
  "*.har",
  "*.webm"
];
const REQUIRED_PREMIUM_LOCALES = PREMIUM_LOCALE_RECORDS.map((record) => record.locale);
const REQUIRED_OPEN_SOURCE_FILES = [
  "LICENSE",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  ".github/CODEOWNERS",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/glossary_submission.yml",
  ".github/ISSUE_TEMPLATE/qa_report.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/workflows/ci.yml",
  ".github/dependabot.yml"
];
const REQUIRED_ZIP_ENTRIES = [
  "LICENSE",
  "PRIVACY_POLICY.md",
  "README.md",
  "manifest.json",
  "src/content/content.js",
  "src/background/background.js"
];

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertFile(path) {
  assert(existsSync(join(ROOT, path)), `Missing file referenced by manifest/package: ${path}`);
}

function listFiles(dir, predicate) {
  const root = join(ROOT, dir);
  const results = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const relativePath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      results.push(...listFiles(relativePath, predicate));
    } else if (!predicate || predicate(relativePath)) {
      results.push(relativePath);
    }
  }
  return results;
}

const pkg = readJson("package.json");
assert(pkg.license === "MIT", "package.json license must be MIT");
assert(
  pkg.repository && /heznpc\/AcademyLens\.git$/i.test(pkg.repository.url),
  "package.json repository must point to AcademyLens"
);
assert(
  pkg.bugs && /heznpc\/AcademyLens\/issues$/i.test(pkg.bugs.url),
  "package.json bugs URL must point to AcademyLens issues"
);
for (const script of REQUIRED_PACKAGE_SCRIPTS) {
  assert(pkg.scripts && pkg.scripts[script], `Missing package script: ${script}`);
}

for (const file of REQUIRED_OPEN_SOURCE_FILES) {
  assertFile(file);
}
assert(!existsSync(join(ROOT, ".chrome-profile")), ".chrome-profile must not live inside the repository");

const gitignore = readFileSync(join(ROOT, ".gitignore"), "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
for (const pattern of REQUIRED_GITIGNORE_PATTERNS) {
  assert(gitignore.includes(pattern), `Missing .gitignore pattern: ${pattern}`);
}

const trackedIgnoredFiles = execFileSync("git", ["ls-files", "-ci", "--exclude-standard"], {
  cwd: ROOT,
  encoding: "utf8"
}).trim();
assert(!trackedIgnoredFiles, `Tracked files match .gitignore:\n${trackedIgnoredFiles}`);

const manifest = readJson("manifest.json");
assert(manifest.manifest_version === 3, "Manifest must be MV3");
assert(manifest.name.includes("Unofficial"), "Manifest name must keep unofficial notice");
assert(/not affiliated with OpenAI/i.test(manifest.description), "Manifest description must disclose non-affiliation");
assert(!JSON.stringify(manifest).includes("js.puter.com"), "Manifest must not reference remote Puter.js");

for (const size of ["16", "48", "128"]) {
  assertFile(manifest.icons[size]);
  assertFile(manifest.action.default_icon[size]);
}
assertFile(manifest.action.default_popup);
assertFile(manifest.background.service_worker);

for (const contentScript of manifest.content_scripts || []) {
  for (const js of contentScript.js || []) assertFile(js);
  for (const css of contentScript.css || []) assertFile(css);
}
for (const resource of manifest.web_accessible_resources || []) {
  for (const item of resource.resources || []) {
    if (item.endsWith("/*")) {
      assert(existsSync(join(ROOT, item.slice(0, -2))), `Missing resource directory: ${item}`);
    } else if (item.includes("*")) {
      assert(existsSync(join(ROOT, dirname(item))), `Missing wildcard resource directory: ${item}`);
    } else {
      assertFile(item);
    }
  }
}

const glossaryIndex = readJson("src/data/glossary.index.json");
for (const term of REQUIRED_PROTECTED_TERMS) {
  assert(glossaryIndex.protectedTerms.includes(term), `Missing protected term: ${term}`);
}
assert(Array.isArray(glossaryIndex.glossaries), "Glossary registry must list registered language glossaries");
for (const locale of REQUIRED_PREMIUM_LOCALES) {
  assert(
    glossaryIndex.glossaries.some(
      (entry) => entry.locale === locale && entry.path === `src/data/glossary.${locale}.json`
    ),
    `Glossary registry must include premium pack: ${locale}`
  );
}
assertFile("tests/fixtures/gradual-study-room-fragment.html");
assertFile("tests/fixtures/gradual-live-lesson-shell.html");
assertFile("src/lib/ai-review-bridge.js");
assertFile("docs/GLOSSARY_CONTRIBUTING.md");
assertFile("docs/QUALITY_ROADMAP.md");
assertFile("docs/RELEASE_CHECKLIST.md");
assertFile("docs/TECH_STACK_REVIEW.md");

const publicCourseFixture = "tests/fixtures/openai-academy-public-course.html";
assertFile(publicCourseFixture);
const publicCourseFixtureSource = readFileSync(join(ROOT, publicCourseFixture), "utf8");
assert(publicCourseFixtureSource.length < 10000, "Public Academy course fixture should stay sanitized and small");
assert(!/<script[^>]+src=/i.test(publicCourseFixtureSource), "Public Academy fixture must not include remote scripts");
assert(
  !/sentry-trace|baggage|__CF\$cv|_buildManifest/i.test(publicCourseFixtureSource),
  "Public Academy fixture must not include live runtime telemetry metadata"
);

const runtimeFiles = ["manifest.json", ...listFiles("src", (path) => /\.(js|html|json)$/i.test(path))];
for (const file of runtimeFiles) {
  const source = readFileSync(join(ROOT, file), "utf8");
  assert(!/js\.puter\.com/i.test(source), `Remote Puter script reference is not allowed in runtime: ${file}`);
  assert(!/<script[^>]+src=["']https?:\/\//i.test(source), `Remote script tag is not allowed in runtime: ${file}`);
  assert(!/importScripts\(\s*["']https?:\/\//i.test(source), `Remote importScripts is not allowed in runtime: ${file}`);
  assert(!/import\(\s*["']https?:\/\//i.test(source), `Remote dynamic import is not allowed in runtime: ${file}`);
}

const positioningFiles = ["README.md", "store-assets/STORE_LISTING.md", "docs/MVP_PLAN.md", "docs/TERMINOLOGY_MAP.md"];
for (const file of positioningFiles) {
  const source = readFileSync(join(ROOT, file), "utf8");
  assert(!/Korean-first/i.test(source), `Positioning should not narrow AcademyLens to Korean-first: ${file}`);
}

const zipPath = join(ROOT, "dist", "academy-lens.zip");
if (existsSync(zipPath)) {
  assert(statSync(zipPath).size > 1000, "Build zip exists but looks too small");
  const zipSource = readFileSync(zipPath);
  for (const entry of REQUIRED_ZIP_ENTRIES) {
    assert(zipSource.includes(Buffer.from(entry)), `Build zip is missing required entry: ${entry}`);
  }
  assert(!zipSource.includes(Buffer.from(".DS_Store")), "Build zip must not include .DS_Store");
}

const zipEntries = collectEntries().map((entry) => entry.entry);
for (const entry of REQUIRED_ZIP_ENTRIES) {
  assert(zipEntries.includes(entry), `Zip build inputs are missing required entry: ${entry}`);
}

console.log("file checks ok");
