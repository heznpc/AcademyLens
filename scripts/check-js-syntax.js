const { readdirSync, statSync } = require("node:fs");
const { join, relative } = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = join(__dirname, "..");
const INCLUDE = ["src", "tests", "scripts"];
const EXTRA_FILES = ["eslint.config.js", "playwright.config.js"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".chrome-profile", "coverage"]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path, files);
    } else if (path.endsWith(".js")) {
      files.push(path);
    }
  }
  return files;
}

const files = [
  ...INCLUDE.flatMap((dir) => walk(join(ROOT, dir))),
  ...EXTRA_FILES.map((file) => join(ROOT, file))
].filter((file, index, all) => all.indexOf(file) === index);

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: ROOT,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    failed = true;
    console.error(`Syntax check failed: ${relative(ROOT, file)}`);
    if (result.stderr) console.error(result.stderr.trim());
  }
}

if (failed) {
  process.exit(1);
}

console.log(`node --check ok (${files.length} files)`);
