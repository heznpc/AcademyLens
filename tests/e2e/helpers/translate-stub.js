const KO = new Map([
  ["AI Foundations", "AI 기초"],
  ["Build practical AI skills for work", "업무를 위한 실용 AI 기술 구축"],
  [
    "This course is designed to build foundations for using __AL_TERM_0__ and __AL_TERM_1__ safely.",
    "이 과정은 __AL_TERM_0__와 __AL_TERM_1__를 안전하게 사용하기 위한 기반을 구축하도록 설계되었습니다."
  ],
  [
    "This course is designed to build foundations for using AI and __AL_TERM_0__ safely.",
    "이 과정은 AI와 __AL_TERM_0__를 안전하게 사용하기 위한 기반을 구축하도록 설계되었습니다."
  ],
  [
    "__AL_TERM_0__ help people practice responsible review.",
    "__AL_TERM_0__은 사람들이 책임 있는 검토를 연습하도록 돕습니다."
  ],
  [
    "__AL_TERM_0__ courses use __AL_TERM_1__ and __AL_TERM_2__.",
    "__AL_TERM_0__ 강의는 __AL_TERM_1__와 __AL_TERM_2__를 사용합니다."
  ],
  [
    "__AL_TERM_0__ __AL_TERM_1__ help teams build __AL_TERM_2__.",
    "__AL_TERM_0__ __AL_TERM_1__는 팀이 __AL_TERM_2__를 구축하도록 돕습니다."
  ],
  ["__AL_TERM_0__ __AL_TERM_1__ examples stay readable.", "__AL_TERM_0__ __AL_TERM_1__ 예제는 읽기 쉽게 유지됩니다."],
  ["Advanced __AL_TERM_0__ engineering", "고급 __AL_TERM_0__ 엔지니어링"],
  ["Advanced __AL_TERM_0__", "고급 __AL_TERM_0__"],
  [
    "__AL_TERM_0__ lessons use __AL_TERM_1__ and __AL_TERM_2__ examples.",
    "__AL_TERM_0__ 강의는 __AL_TERM_1__ 및 __AL_TERM_2__ 예제를 사용합니다."
  ],
  [
    "__AL_TERM_0__ __AL_TERM_1__ improve __AL_TERM_2__ behavior.",
    "__AL_TERM_0__ __AL_TERM_1__는 __AL_TERM_2__ 동작을 개선합니다."
  ],
  [
    "__AL_TERM_0__ can help draft repeatable __AL_TERM_1__.",
    "__AL_TERM_0__은 반복 가능한 __AL_TERM_1__ 초안을 도울 수 있습니다."
  ],
  [
    "__AL_TERM_0__ can help draft __AL_TERM_1__ __AL_TERM_2__.",
    "__AL_TERM_0__은 __AL_TERM_1__ __AL_TERM_2__ 초안을 도울 수 있습니다."
  ],
  [
    "__AL_TERM_0__ help teams evaluate outputs responsibly.",
    "__AL_TERM_0__은 팀이 결과물을 책임 있게 평가하도록 돕습니다."
  ],
  [
    "__AL_TERM_0__ help teams evaluate __AL_TERM_1__ __AL_TERM_2__.",
    "__AL_TERM_0__은 팀이 __AL_TERM_1__을 __AL_TERM_2__ 평가하도록 돕습니다."
  ],
  [
    "__AL_TERM_0__ help teams evaluate __AL_TERM_2__ __AL_TERM_1__.",
    "__AL_TERM_0__은 팀이 __AL_TERM_2__을 __AL_TERM_1__ 평가하도록 돕습니다."
  ],
  [
    "Set clear __AL_TERM_1__ before using __AL_TERM_0__.",
    "__AL_TERM_0__를 사용하기 전에 명확한 __AL_TERM_1__를 설정하세요."
  ],
  [
    "Reusable __AL_TERM_0__ help __AL_TERM_1__ follow boundaries.",
    "재사용 가능한 __AL_TERM_0__는 __AL_TERM_1__가 경계를 따르도록 돕습니다."
  ]
]);

const JA = new Map([
  ["Build practical AI skills for work", "仕事のための実践的なAIスキルを構築"],
  [
    "__AL_TERM_0__ courses use __AL_TERM_1__ and __AL_TERM_2__.",
    "__AL_TERM_0__ のコースでは __AL_TERM_1__ と __AL_TERM_2__ を使用します。"
  ],
  [
    "__AL_TERM_0__ workflows help teams build agents.",
    "__AL_TERM_0__ ワークフローはチームがエージェントを構築するのに役立ちます。"
  ],
  ["__AL_TERM_0__ __AL_TERM_1__ examples stay readable.", "__AL_TERM_0__ __AL_TERM_1__ の例は読みやすいままです。"]
]);

function fallback(text, targetLanguage) {
  return `[${targetLanguage}] ${text}`;
}

function translate(text, targetLanguage) {
  if (targetLanguage === "ko") return KO.get(text) || fallback(text, targetLanguage);
  if (targetLanguage === "ja") return JA.get(text) || fallback(text, targetLanguage);
  return fallback(text, targetLanguage);
}

async function registerTranslateStub(context, options = {}) {
  const calls = [];
  const delayMs = options.delayMs || 0;

  await context.route("https://translate.googleapis.com/translate_a/single**", async (route) => {
    const url = new URL(route.request().url());
    const text = url.searchParams.get("q") || "";
    const targetLanguage = url.searchParams.get("tl") || "ko";
    calls.push({ text, targetLanguage });

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    if (options.failAll) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "unavailable" })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([[[translate(text, targetLanguage), text, null, null]]])
    });
  });

  return calls;
}

module.exports = {
  registerTranslateStub
};
