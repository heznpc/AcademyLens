const assert = require("node:assert/strict");
const test = require("node:test");

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
