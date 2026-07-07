const assert = require("node:assert/strict");
const test = require("node:test");
const { collectStringValues, hostnameMatches, isBlockedRemoteUrl } = require("../scripts/lib/url-policy.js");

const BLOCKED_HOSTS = new Set(["js.puter.com"]);

test("URL policy matches exact hosts and real subdomains only", () => {
  assert.equal(hostnameMatches("js.puter.com", "js.puter.com"), true);
  assert.equal(hostnameMatches("cdn.js.puter.com", "js.puter.com"), true);
  assert.equal(hostnameMatches("eviljs.puter.com", "js.puter.com"), false);
});

test("URL policy checks the parsed hostname rather than URL substrings", () => {
  assert.equal(isBlockedRemoteUrl("https://js.puter.com/sdk.js", BLOCKED_HOSTS), true);
  assert.equal(isBlockedRemoteUrl("https://cdn.js.puter.com/sdk.js", BLOCKED_HOSTS), true);
  assert.equal(
    isBlockedRemoteUrl("https://example.com/redirect?next=https://js.puter.com/sdk.js", BLOCKED_HOSTS),
    false
  );
  assert.equal(isBlockedRemoteUrl("src/content/content.js", BLOCKED_HOSTS), false);
});

test("collectStringValues walks nested manifest-like values", () => {
  assert.deepEqual(
    collectStringValues({
      permissions: ["storage"],
      nested: { matches: ["https://academy.openai.com/*"], enabled: true }
    }),
    ["storage", "https://academy.openai.com/*"]
  );
});
