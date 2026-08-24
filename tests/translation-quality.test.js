const assert = require("node:assert/strict");
const test = require("node:test");

const Quality = require("../src/lib/translation-quality.js");

test("translation quality accepts target-script output with exact placeholders", () => {
  const result = Quality.validate(
    "Build reliable __AL_TERM_0__ with human oversight.",
    "사람의 감독을 통해 신뢰할 수 있는 __AL_TERM_0__를 구축하세요.",
    "ko"
  );
  assert.deepEqual(result, { ok: true, issue: "" });
});

test("translation quality rejects placeholder drift and source copies", () => {
  assert.equal(Quality.qualityIssue("Use __AL_TERM_0__ safely.", "안전하게 사용하세요.", "ko"), "placeholder-drift");
  assert.equal(Quality.qualityIssue("Build reliable agents.", "Build reliable agents.", "ko"), "source-copy");
});

test("translation quality rejects target-script misses and embedded English leakage", () => {
  assert.equal(Quality.qualityIssue("Build reliable agents.", "Reliable agents", "ko"), "target-script-missing");
  assert.equal(
    Quality.qualityIssue(
      "A connected path helps people learn AI.",
      "연결된 학습 경로를 만들어people 학습을 돕습니다.",
      "ko"
    ),
    "source-leakage:people"
  );
});

test("translation quality permits preserved product and language names", () => {
  assert.equal(
    Quality.validate("Build Python tools for ChatGPT.", "ChatGPT용 Python 도구를 구축하세요.", "ko").ok,
    true
  );
});
