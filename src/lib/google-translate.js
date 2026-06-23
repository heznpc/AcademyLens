(function initAcademyLensGoogleTranslate(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.AcademyLensGoogleTranslate = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function googleTranslateFactory() {
  "use strict";

  function buildGoogleTranslateUrl(text, targetLanguage) {
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", "auto");
    url.searchParams.set("tl", targetLanguage || "ko");
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", text);
    return url.toString();
  }

  function parseGoogleTranslatePayload(payload) {
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
      throw new Error("Unexpected Google Translate response");
    }

    const translated = payload[0]
      .filter((segment) => Array.isArray(segment) && typeof segment[0] === "string")
      .map((segment) => segment[0])
      .join("");

    if (!translated) {
      throw new Error("Empty Google Translate response");
    }

    return translated;
  }

  async function translateText(text, targetLanguage, fetchImpl) {
    const requestFetch = fetchImpl || fetch;
    const response = await requestFetch(buildGoogleTranslateUrl(text, targetLanguage));
    if (!response || !response.ok) {
      const status = response && response.status ? response.status : "unknown";
      throw new Error(`Google Translate request failed with ${status}`);
    }

    return parseGoogleTranslatePayload(await response.json());
  }

  return Object.freeze({
    buildGoogleTranslateUrl,
    parseGoogleTranslatePayload,
    translateText
  });
});
