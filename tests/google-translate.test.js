const assert = require("node:assert/strict");
const test = require("node:test");

const GoogleTranslate = require("../src/lib/google-translate.js");

test("buildGoogleTranslateUrl targets Google Translate without credentials", () => {
  const url = new URL(GoogleTranslate.buildGoogleTranslateUrl("AI Foundations", "ko"));

  assert.equal(url.origin, "https://translate.googleapis.com");
  assert.equal(url.searchParams.get("client"), "gtx");
  assert.equal(url.searchParams.get("sl"), "en");
  assert.equal(url.searchParams.get("tl"), "ko");
  assert.equal(url.searchParams.get("q"), "AI Foundations");
});

test("parseGoogleTranslatePayload joins translated segments", () => {
  const payload = [
    [
      ["AI 기초", "AI Foundations", null, null],
      [" 과정", " course", null, null]
    ]
  ];

  assert.equal(GoogleTranslate.parseGoogleTranslatePayload(payload), "AI 기초 과정");
});

test("parseGoogleTranslatePayload rejects malformed responses", () => {
  assert.throws(
    () => GoogleTranslate.parseGoogleTranslatePayload({ error: "rate limited" }),
    /Unexpected Google Translate response/
  );
});

test("translateText surfaces failed background translation requests", async () => {
  await assert.rejects(
    () =>
      GoogleTranslate.translateText("AI Foundations", "ko", async () => ({
        ok: false,
        status: 429
      })),
    /Google Translate request failed with 429/
  );
});

test("translateText parses a successful response", async () => {
  const translated = await GoogleTranslate.translateText("AI Foundations", "ko", async () => ({
    ok: true,
    status: 200,
    async json() {
      return [[["AI 기초", "AI Foundations", null, null]]];
    }
  }));

  assert.equal(translated, "AI 기초");
});
