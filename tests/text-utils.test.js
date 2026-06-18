const assert = require("node:assert/strict");
const test = require("node:test");

const Text = require("../src/lib/text-utils.js");

test("filters text that should not be translated", () => {
  assert.equal(Text.shouldTranslateText("OpenAI Academy courses help people build practical AI skills.", "ko"), true);
  assert.equal(Text.shouldTranslateText("12345", "ko"), false);
  assert.equal(Text.shouldTranslateText("https://academy.openai.com", "ko"), false);
  assert.equal(Text.shouldTranslateText("API", "ko"), false);
  assert.equal(Text.shouldTranslateText("이미 한국어 문장입니다.", "ko"), false);
  assert.equal(Text.shouldTranslateText("이미 한국어 OpenAI 문장입니다.", "ko"), false);
  assert.equal(Text.shouldTranslateText("Already English", "en"), false);
});

test("skips text that already contains the target language script", () => {
  assert.equal(Text.shouldTranslateText("이미 한국어 OpenAI 문장입니다.", "ko"), false);
  assert.equal(Text.shouldTranslateText("यह Hindi OpenAI Academy वाक्य है.", "hi"), false);
  assert.equal(Text.shouldTranslateText("OpenAI Academy पाठ्यक्रम", "hi"), false);
  assert.equal(Text.shouldTranslateText("OpenAI Academy courses help people build practical AI skills.", "hi"), true);
});

test("skips Gradual platform control phrases", () => {
  assert.equal(Text.shouldTranslateText("Lesson 2 of 5", "ko"), false);
  assert.equal(Text.shouldTranslateText("2/5 Lessons Completed", "ko"), false);
  assert.equal(Text.shouldTranslateText("View Certificate", "ko"), false);
  assert.equal(Text.shouldTranslateText("Start quiz", "ko"), false);
  assert.equal(Text.shouldTranslateText("Home", "ko"), false);
  assert.equal(Text.shouldTranslateText("Courses", "ko"), false);
  assert.equal(Text.shouldTranslateText("Share", "ko"), false);
  assert.equal(Text.shouldTranslateText("Participants", "ko"), false);
  assert.equal(Text.shouldTranslateText("Terms of Use", "ko"), false);
  assert.equal(Text.shouldTranslateText("Privacy Policy", "ko"), false);
  assert.equal(Text.shouldTranslateText("Code of Conduct", "ko"), false);
  assert.equal(Text.shouldTranslateText("Your Privacy Choices", "ko"), false);
  assert.equal(Text.shouldTranslateText("Switch language", "ko"), false);
  assert.equal(Text.shouldTranslateText("Build practical AI skills for work", "ko"), true);
});

test("normalizes whitespace", () => {
  assert.equal(Text.normalizeWhitespace("  Agents\n\nand\tworkflows  "), "Agents and workflows");
});

test("stableHash is deterministic", () => {
  assert.equal(Text.stableHash("AI Foundations"), Text.stableHash("AI Foundations"));
  assert.notEqual(Text.stableHash("AI Foundations"), Text.stableHash("Applied AI Foundations"));
});
