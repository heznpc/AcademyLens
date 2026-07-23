const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const ROOT = join(__dirname, "..");

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

test("content scripts load in dependency order", () => {
  const manifest = readJson("manifest.json");

  assert.deepEqual(manifest.content_scripts[0].js, [
    "src/lib/constants.js",
    "src/lib/cache.js",
    "src/lib/browser-translator.js",
    "src/lib/google-translate.js",
    "src/lib/remote-google-translator.js",
    "src/lib/glossary.js",
    "src/lib/text-utils.js",
    "src/content/content-helpers.js",
    "src/content/dom-translation-runtime.js",
    "src/content/frame-messenger.js",
    "src/content/panel-view.js",
    "src/content/content.js"
  ]);
});
