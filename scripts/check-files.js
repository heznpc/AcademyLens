const { existsSync, readdirSync, readFileSync, statSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const { dirname, join } = require("node:path");

const ROOT = join(__dirname, "..");
const REQUIRED_PACKAGE_SCRIPTS = [
  "test",
  "test:e2e",
  "lint",
  "format:check",
  "node-check",
  "capture:academy",
  "check:manifest",
  "check:glossary",
  "check:files",
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
for (const script of REQUIRED_PACKAGE_SCRIPTS) {
  assert(pkg.scripts && pkg.scripts[script], `Missing package script: ${script}`);
}

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
assert(
  glossaryIndex.glossaries.some((entry) => entry.locale === "ko" && entry.path === "src/data/glossary.ko.json"),
  "Glossary registry must keep the first reviewed Korean pack registered"
);
assertFile("tests/fixtures/gradual-study-room-fragment.html");
assertFile("src/lib/ai-review-bridge.js");
assertFile("docs/GLOSSARY_CONTRIBUTING.md");

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
}

console.log("file checks ok");
