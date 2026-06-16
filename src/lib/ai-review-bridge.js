(function initAcademyLensAiReviewBridge(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.AcademyLensAiReviewBridge = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function aiReviewBridgeFactory() {
  "use strict";

  const STATUS = Object.freeze({
    enabled: false,
    reason: "AI-assisted terminology review is disabled until a Chrome Web Store-safe local bridge is implemented."
  });

  function getStatus() {
    return STATUS;
  }

  function assertExplicitOptIn(options) {
    if (!options || options.explicitOptIn !== true) {
      throw new Error("AI terminology review requires explicit opt-in.");
    }
  }

  function normalizeSnippet(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200);
  }

  function prepareReviewRequest(options) {
    assertExplicitOptIn(options);
    if (!STATUS.enabled) {
      throw new Error(STATUS.reason);
    }

    const snippets = (Array.isArray(options.snippets) ? options.snippets : [])
      .map(normalizeSnippet)
      .filter(Boolean)
      .slice(0, 20);

    return Object.freeze({
      targetLanguage: options.targetLanguage || "ko",
      snippets
    });
  }

  return Object.freeze({
    getStatus,
    normalizeSnippet,
    prepareReviewRequest
  });
});
