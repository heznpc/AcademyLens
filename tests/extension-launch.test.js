const assert = require("node:assert/strict");
const test = require("node:test");

const { resolveHeadless } = require("./e2e/helpers/extension.js");

test("extension E2E runs headless by default and keeps headed mode explicit", () => {
  assert.equal(resolveHeadless({}, {}), true);
  assert.equal(resolveHeadless({}, { E2E_HEADED: "0" }), true);
  assert.equal(resolveHeadless({}, { E2E_HEADED: "1" }), false);
  assert.equal(resolveHeadless({ headless: true }, { E2E_HEADED: "1" }), true);
  assert.equal(resolveHeadless({ headless: false }, {}), false);
});
