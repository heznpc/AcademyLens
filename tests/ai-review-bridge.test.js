const assert = require("node:assert/strict");
const test = require("node:test");

const AiReviewBridge = require("../src/lib/ai-review-bridge.js");

test("AI review bridge is disabled by default", () => {
  const status = AiReviewBridge.getStatus();

  assert.equal(status.enabled, false);
  assert.match(status.reason, /disabled/);
});

test("AI review request requires explicit opt-in before any runtime path can proceed", () => {
  assert.throws(
    () =>
      AiReviewBridge.prepareReviewRequest({
        targetLanguage: "ko",
        snippets: ["OpenAI Academy terminology"]
      }),
    /explicit opt-in/
  );
});

test("AI review request remains unavailable even with opt-in until a safe bridge is implemented", () => {
  assert.throws(
    () =>
      AiReviewBridge.prepareReviewRequest({
        explicitOptIn: true,
        targetLanguage: "ko",
        snippets: ["  Review   GPT terminology.  "]
      }),
    /disabled/
  );
  assert.equal(AiReviewBridge.normalizeSnippet("  Review   GPT terminology.  "), "Review GPT terminology.");
});
