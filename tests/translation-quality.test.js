const assert = require("node:assert/strict");
const test = require("node:test");

const Constants = require("../src/lib/constants.js");
const Quality = require("../src/lib/translation-quality.js");

test("translation quality classifies every supported target without a fake Latin script guard", () => {
  assert.deepEqual(Object.keys(Quality.TARGET_LANGUAGE_GROUPS), Constants.SUPPORTED_LANGUAGE_CODES);

  for (const language of Constants.SUPPORTED_LANGUAGE_CODES) {
    const profile = Quality.validationProfile(language);
    assert.notEqual(profile.group, "unknown", language);
    assert.equal(profile.supplementalLanguageDetection, "chrome-i18n-when-reliable", language);
    if (profile.group === "latin") {
      assert.equal(Quality.SCRIPT_GUARDS[language], undefined, language);
      assert.equal(
        profile.languageDetection,
        language === "en" ? "none" : "english-evidence-and-source-leakage",
        language
      );
    } else {
      assert.ok(Quality.SCRIPT_GUARDS[language], language);
      assert.equal(profile.languageDetection, "target-script", language);
    }
  }
});

test("translation quality enforces each distinctive target-script family", async (t) => {
  const samples = {
    ko: "신뢰할 수 있는 에이전트를 구축하세요.",
    ja: "信頼できるエージェントを構築します。",
    "zh-CN": "构建可靠的智能代理。",
    "zh-TW": "建立可靠的智慧代理。",
    ru: "Создавайте надежных агентов.",
    uk: "Створюйте надійних агентів.",
    ar: "أنشئ وكلاء موثوقين.",
    hi: "विश्वसनीय एजेंट बनाएँ।",
    th: "สร้างเอเจนต์ที่เชื่อถือได้",
    bn: "নির্ভরযোগ্য এজেন্ট তৈরি করুন।",
    iw: "בנו סוכנים אמינים.",
    el: "Δημιουργήστε αξιόπιστους πράκτορες."
  };

  for (const [targetLanguage, translated] of Object.entries(samples)) {
    await t.test(targetLanguage, () => {
      assert.equal(Quality.validate("Build reliable agents.", translated, targetLanguage).ok, true);
      assert.equal(
        Quality.qualityIssue("Build reliable agents.", "An unrelated English answer.", targetLanguage),
        "target-script-missing"
      );
    });
  }
});

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

test("translation quality treats ordinary Title Case words as language content", () => {
  assert.equal(Quality.qualityIssue("Build Reliable Agents.", "Wrong Answer.", "ko"), "target-script-missing");
  assert.equal(
    Quality.qualityIssue(
      "Build Reliable Agents with Clear Instructions.",
      "신뢰할 수 있는 Reliable Agents를 구축합니다.",
      "ko"
    ),
    "source-leakage:reliable,agents"
  );
});

test("translation quality permits preserved product and language names", () => {
  assert.equal(
    Quality.validate("Build Python tools for ChatGPT.", "ChatGPT용 Python 도구를 구축하세요.", "ko").ok,
    true
  );
});

test("translation quality detects copied source phrases conservatively for Latin targets", () => {
  assert.equal(
    Quality.qualityIssue(
      "Build reliable agents with clear instructions.",
      "Construya reliable agents con instrucciones claras.",
      "es"
    ),
    "source-leakage:reliable,agents"
  );
  assert.equal(
    Quality.validate("Use software to build safe systems.", "Utilice software para crear sistemas seguros.", "es").ok,
    true
  );
});

test("translation quality rejects strong English evidence for Latin non-English targets", () => {
  for (const targetLanguage of ["es", "fr", "de", "pt-BR"]) {
    assert.equal(
      Quality.qualityIssue("Build reliable agents.", "Completely unrelated English sentence.", targetLanguage),
      "wrong-target-language:en",
      targetLanguage
    );
  }

  assert.equal(Quality.validate("Use AI safely.", "Utilisez AI avec prudence.", "fr").ok, true);
  assert.equal(Quality.validate("Build a model.", "Modell erstellen.", "de").ok, true);
});

test("translation quality normalizes regional codes and the modern Hebrew alias", () => {
  assert.equal(Quality.validationProfile("pt_br").targetLanguage, "pt-BR");
  assert.equal(Quality.validationProfile("he").targetLanguage, "iw");
});

test("async quality validation rejects only high-confidence cross-language mismatches", async () => {
  const source = "Build reliable systems with clear review instructions.";
  const french = "Les équipes construisent des systèmes fiables avec des instructions de révision claires.";
  let calls = 0;
  const mismatch = await Quality.validateAsync(source, french, "es", async () => {
    calls += 1;
    return { isReliable: true, languages: [{ language: "fr", percentage: 96 }] };
  });
  assert.deepEqual(mismatch, { ok: false, issue: "detected-language-mismatch:fr" });
  assert.equal(calls, 1);

  const unreliable = await Quality.validateAsync(source, french, "es", async () => ({
    isReliable: false,
    languages: [{ language: "fr", percentage: 99 }]
  }));
  assert.deepEqual(unreliable, { ok: true, issue: "" });

  const lowPercentage = await Quality.validateAsync(source, french, "es", async () => ({
    isReliable: true,
    languages: [{ language: "fr", percentage: 79 }]
  }));
  assert.deepEqual(lowPercentage, { ok: true, issue: "" });
});

test("async quality validation lets reliable target detection resolve Latin loanword leakage", async () => {
  const source = "Use software and internet tools safely to complete the course and review every result.";
  const spanish =
    "Utilice software e internet de forma segura para completar el curso y revisar cuidadosamente todos los resultados.";
  assert.deepEqual(Quality.validate(source, spanish, "es"), {
    ok: false,
    issue: "source-leakage:software,internet"
  });

  const confirmed = await Quality.validateAsync(source, spanish, "es", async () => ({
    isReliable: true,
    languages: [{ language: "es", percentage: 98 }]
  }));
  assert.deepEqual(confirmed, { ok: true, issue: "" });

  const unreliable = await Quality.validateAsync(source, spanish, "es", async () => ({
    isReliable: false,
    languages: [{ language: "es", percentage: 100 }]
  }));
  assert.deepEqual(unreliable, { ok: false, issue: "source-leakage:software,internet" });

  const mismatch = await Quality.validateAsync(source, spanish, "es", async () => ({
    isReliable: true,
    languages: [{ language: "fr", percentage: 97 }]
  }));
  assert.deepEqual(mismatch, { ok: false, issue: "detected-language-mismatch:fr" });
});

test("async quality validation never rescues placeholder drift or source copies", async () => {
  let detectionCalls = 0;
  const detectSpanish = async () => {
    detectionCalls += 1;
    return { isReliable: true, languages: [{ language: "es", percentage: 100 }] };
  };

  const placeholderDrift = await Quality.validateAsync(
    "Use __AL_TERM_0__ with software and internet tools.",
    "Utilice software e internet con estas herramientas seguras.",
    "es",
    detectSpanish
  );
  assert.deepEqual(placeholderDrift, { ok: false, issue: "placeholder-drift" });

  const source = "Use software and internet tools safely to complete the course and review every result.";
  const sourceCopy = await Quality.validateAsync(source, source, "es", detectSpanish);
  assert.deepEqual(sourceCopy, { ok: false, issue: "source-copy" });

  const excessiveLeakage = await Quality.validateAsync(
    "Review model output and final assessment before sharing.",
    "Revise model output final antes de compartir la evaluación y toda la información sensible.",
    "es",
    detectSpanish
  );
  assert.deepEqual(excessiveLeakage, { ok: false, issue: "source-leakage:model,output,final" });
  assert.equal(detectionCalls, 0);
});

test("async quality validation normalizes supported detector aliases", async (t) => {
  const aliases = [
    {
      target: "pt-BR",
      detected: "pt",
      translated: "Uma tradução suficientemente longa para permitir uma detecção confiável do idioma solicitado."
    },
    {
      target: "pt",
      detected: "pt-PT",
      translated: "Uma tradução suficientemente longa para permitir uma detecção confiável do idioma solicitado."
    },
    {
      target: "iw",
      detected: "he",
      translated: "זהו תרגום ארוך מספיק כדי לאפשר זיהוי אמין של שפת היעד המבוקשת."
    },
    {
      target: "he",
      detected: "iw",
      translated: "זהו תרגום ארוך מספיק כדי לאפשר זיהוי אמין של שפת היעד המבוקשת."
    },
    {
      target: "tl",
      detected: "fil",
      translated: "Ito ay sapat na mahabang salin upang mapahintulutan ang maaasahang pagtukoy sa hinihinging wika."
    },
    {
      target: "fil",
      detected: "tl",
      translated: "Ito ay sapat na mahabang salin upang mapahintulutan ang maaasahang pagtukoy sa hinihinging wika."
    },
    {
      target: "zh-CN",
      detected: "zh-Hans",
      translated: "这是一段足够长的译文，可以可靠地检测所请求的目标语言。"
    },
    {
      target: "zh-TW",
      detected: "zh-CN",
      translated: "這是一段足夠長的譯文，可以可靠地偵測所要求的目標語言。"
    }
  ];

  for (const item of aliases) {
    await t.test(`${item.target}:${item.detected}`, async () => {
      const result = await Quality.validateAsync(
        "Build reliable systems with clear review instructions.",
        item.translated,
        item.target,
        async () => ({ isReliable: true, languages: [{ language: item.detected, percentage: 100 }] })
      );
      assert.deepEqual(result, { ok: true, issue: "" });
    });
  }
});

test("async quality validation strips placeholders and URLs and falls back for short samples or API failures", async () => {
  let detectedText = "";
  const source = "Read __AL_TERM_0__ at https://academy.openai.com before reviewing the final output.";
  const translated =
    "Consulte __AL_TERM_0__ en https://academy.openai.com antes de revisar cuidadosamente el resultado final.";
  const valid = await Quality.validateAsync(source, translated, "es", async (sample) => {
    detectedText = sample;
    return { isReliable: true, languages: [{ language: "es", percentage: 98 }] };
  });
  assert.deepEqual(valid, { ok: true, issue: "" });
  assert.doesNotMatch(detectedText, /__AL_TERM_0__|https?:\/\//);

  let shortCalls = 0;
  const short = await Quality.validateAsync("Say hello.", "Bonjour.", "fr", async () => {
    shortCalls += 1;
    return { isReliable: true, languages: [{ language: "en", percentage: 100 }] };
  });
  assert.deepEqual(short, { ok: true, issue: "" });
  assert.equal(shortCalls, 0);

  const unavailable = await Quality.validateAsync(source, translated, "es", async () => {
    throw new Error("detectLanguage unavailable");
  });
  assert.deepEqual(unavailable, { ok: true, issue: "" });
});
