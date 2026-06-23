const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const ROOT = join(__dirname, "..");

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
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
