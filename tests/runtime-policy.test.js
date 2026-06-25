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
  const sendTranslationBatch = source.slice(
    source.indexOf("async function sendTranslationBatch"),
    source.indexOf("function message", source.indexOf("async function sendTranslationBatch"))
  );

  assert(!source.includes("BACKGROUND_FALLBACK_DELAY_MS"));
  assert(!sendTranslationBatch.includes("Promise.race"));
  assert.match(sendTranslationBatch, /await sendMessage/);
  assert.match(sendTranslationBatch, /translateBatchInContent/);
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
