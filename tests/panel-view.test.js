const assert = require("node:assert/strict");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const PanelView = require("../src/content/panel-view.js");

function message(key) {
  return `msg:${key}`;
}

test("panel view renders the required controls and live status region", () => {
  const html = PanelView.renderPanel({
    browserTranslatorStatus: "available",
    iconUrl: "chrome-extension://test/assets/icons/icon48.png",
    message,
    providerMessageKey(mode) {
      return `provider.${mode}`;
    },
    providerMode: "native",
    version: "0.1.0-test"
  });

  assert.match(html, /data-version="0\.1\.0-test"/);
  assert.match(html, /data-browser-translator="available"/);
  assert.match(html, /data-language/);
  assert.match(html, /data-auto-translate/);
  assert.match(html, /data-native-download/);
  assert.match(html, /data-provider-chip data-provider="native">msg:provider\.native/);
  assert.match(html, /data-status role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /msg:action\.translate/);
  assert.match(html, /msg:action\.restore/);
});

test("panel view exposes the progress, correction, diagnostics, and cache hooks", () => {
  const html = PanelView.renderPanel({
    browserTranslatorStatus: "available",
    iconUrl: "chrome-extension://test/assets/icons/icon48.png",
    message,
    providerMessageKey(mode) {
      return `provider.${mode}`;
    },
    providerMode: "native",
    version: "0.1.0-test"
  });

  // These selectors are wired by the content script and the E2E panel helper; a
  // rename here would otherwise only surface in the slower Playwright run. Parse
  // the markup and querySelector exactly as the content script does, so a
  // suffix-preserving rename (data-clear-cache -> data-clear-cache2) is caught.
  const panel = new JSDOM(`<div id="al-root">${html}</div>`).window.document;
  for (const hook of [
    "data-progress",
    "data-correction-input",
    "data-save-correction",
    "data-correction-list",
    "data-correction-preview",
    "data-diagnostics-output",
    "data-clear-cache"
  ]) {
    assert.ok(panel.querySelector(`[${hook}]`), `panel markup is missing a queryable [${hook}]`);
  }
});
