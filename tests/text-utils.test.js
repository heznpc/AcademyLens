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
  assert.equal(Text.shouldTranslateText("OpenAI Academy курс українською мовою.", "uk"), false);
  assert.equal(Text.shouldTranslateText("OpenAI Academy μάθημα στα ελληνικά.", "el"), false);
  assert.equal(Text.shouldTranslateText("OpenAI Academy courses help people build practical AI skills.", "hi"), true);
});

test("target-script input filtering distinguishes English-dominant examples from translated copy", async (t) => {
  const scriptFamilies = [
    {
      family: "hangul",
      language: "ko",
      mixed: "Compare 한글 examples in this English lesson.",
      dominant: "이 강의는 OpenAI 모델을 안전하게 사용하는 방법을 설명합니다."
    },
    {
      family: "japanese",
      language: "ja",
      mixed: "Use 漢字 examples in this English lesson.",
      dominant: "この講座では OpenAI モデルを安全に使います。"
    },
    {
      family: "han",
      language: "zh-CN",
      mixed: "Compare 中文 examples in this English lesson.",
      dominant: "本课程介绍如何安全使用 OpenAI 模型。"
    },
    {
      family: "cyrillic",
      language: "uk",
      mixed: "Compare the три model variants carefully.",
      dominant: "Цей курс пояснює безпечне використання OpenAI моделей."
    },
    {
      family: "arabic",
      language: "ar",
      mixed: "Compare حرف examples in this English lesson.",
      dominant: "يشرح هذا الدرس استخدام OpenAI بأمان."
    },
    {
      family: "devanagari",
      language: "hi",
      mixed: "Compare शब्द examples in this English lesson.",
      dominant: "यह पाठ OpenAI का सुरक्षित उपयोग समझाता है।"
    },
    {
      family: "thai",
      language: "th",
      mixed: "Compare ไทย examples in this English lesson.",
      dominant: "บทเรียนนี้อธิบายการใช้ OpenAI อย่างปลอดภัย"
    },
    {
      family: "bengali",
      language: "bn",
      mixed: "Compare বাংলা examples in this English lesson.",
      dominant: "এই পাঠে OpenAI নিরাপদভাবে ব্যবহার শেখানো হয়।"
    },
    {
      family: "hebrew",
      language: "iw",
      mixed: "Compare עברית examples in this English lesson.",
      dominant: "השיעור הזה מסביר שימוש בטוח ב-OpenAI."
    },
    {
      family: "greek",
      language: "el",
      mixed: "Compare α, β, and γ in this model.",
      dominant: "Αυτό το μάθημα εξηγεί την ασφαλή χρήση του OpenAI."
    }
  ];

  for (const item of scriptFamilies) {
    await t.test(item.family, () => {
      assert.equal(Text.shouldTranslateText(item.mixed, item.language), true, item.mixed);
      assert.equal(Text.shouldTranslateText(item.dominant, item.language), false, item.dominant);
    });
  }
});

test("skips text inside elements already marked as the target language", () => {
  const element = {
    closest(selector) {
      assert.equal(selector, "[lang]");
      return {
        getAttribute() {
          return "es";
        }
      };
    }
  };

  assert.equal(Text.shouldTranslateText("OpenAI Academy cursos para equipos", "es", 1200, element), false);
  assert.equal(Text.shouldTranslateText("OpenAI Academy courses for teams", "fr", 1200, element), true);
});

test("does not treat a localized document shell as proof that English course copy is translated", () => {
  const documentElement = {
    getAttribute() {
      return "ko";
    }
  };
  const element = {
    ownerDocument: { documentElement, body: {} },
    closest() {
      return documentElement;
    }
  };

  assert.equal(Text.explicitContentLanguage(element), "");
  assert.equal(
    Text.shouldTranslateText("Learn the basics of AI, large language models, and ChatGPT.", "ko", 1200, element),
    true
  );
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
  assert.equal(Text.shouldTranslateText("Start learning", "ko"), false);
  assert.equal(Text.shouldTranslateText("Build practical AI skills for work", "ko"), true);
});

test("normalizes whitespace", () => {
  assert.equal(Text.normalizeWhitespace("  Agents\n\nand\tworkflows  "), "Agents and workflows");
});

test("stableHash is deterministic", () => {
  assert.equal(Text.stableHash("AI Foundations"), Text.stableHash("AI Foundations"));
  assert.notEqual(Text.stableHash("AI Foundations"), Text.stableHash("Applied AI Foundations"));
});
