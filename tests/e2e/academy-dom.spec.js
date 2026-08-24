const { test, expect, startHarness, stopHarness, clickPanelButton, expandPanel } = require("./helpers/harness");

test.describe("AcademyLens academy-dom E2E", () => {
  test("translates study-room lesson text without touching Gradual progress, certificate, quiz, or account UI", async () => {
    const harness = await startHarness({ path: "/study-room" });
    try {
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");
      await expect(harness.page.locator("#study-title")).toHaveText("업무를 위한 실용 AI 기술 구축");
      await expect(harness.page.locator("#study-models")).toHaveText(
        "대규모 언어 모델은 반복 가능한 워크플로 초안을 도울 수 있습니다."
      );
      await expect(harness.page.locator("#study-review")).toHaveText(
        "검토 지점은 팀이 출력을 책임 있게 평가하도록 돕습니다."
      );
      await expect(harness.page.locator("#study-context")).toHaveText(
        "ChatGPT를 사용하기 전에 명확한 컨텍스트를 설정하세요."
      );
      await expect(harness.page.locator("#study-agents")).toHaveText(
        "재사용 가능한 프롬프트는 에이전트가 경계를 따르도록 돕습니다."
      );
      await expect(harness.page.locator(".course-progress")).toContainText("2/5 Lessons Completed");
      await expect(harness.page.locator("#certificate-title")).toHaveText("Course Certificate");
      await expect(harness.page.locator("#quiz-title")).toHaveText("Quiz Results");
      await expect(harness.page.locator("[data-testid='account-menu']")).toContainText("Settings");
    } finally {
      await stopHarness(harness);
    }
  });

  test("translates logged-in courses page cards without touching Gradual navigation or CTAs", async () => {
    const harness = await startHarness({ path: "/logged-in-courses" });
    try {
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");

      await expect(harness.page.locator("#courses-title")).toHaveText("OpenAI Academy 강좌");
      await expect(harness.page.locator("#courses-subtitle")).toHaveText("OpenAI 과정 수료증을 받으세요");
      await expect(harness.page.locator("#course-fit-1")).toHaveText("AI가 처음인 사람에게 적합");
      await expect(harness.page.locator("#course-title-1")).toHaveText("AI 기초");
      await expect(harness.page.locator("#course-summary-1")).toHaveText("AI로 일하기 위한 실용 기술 구축");
      await expect(harness.page.locator("#course-title-2")).toHaveText("프롬프트 엔지니어링");
      await expect(harness.page.locator("#course-title-3")).toHaveText("에이전트로 구축하기");
      await expect(harness.page.locator("#course-cta-1")).toHaveText("Start learning");
      await expect(harness.page.locator("#gradual-sidebar")).toContainText("Home");
      await expect(harness.page.locator("#gradual-sidebar")).toContainText("Courses");
      await expect(harness.page.locator("#gradual-topbar")).toContainText("Search");
      await expect(harness.page.locator("#gradual-topbar")).toContainText("Account");
    } finally {
      await stopHarness(harness);
    }
  });

  test("translates live lesson shell text without touching Gradual state surfaces", async () => {
    const harness = await startHarness({ path: "/live-lesson-shell" });
    try {
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");
      await expect(harness.page.locator("#live-course")).toHaveText("AI 기초");
      await expect(harness.page.locator("#live-title")).toHaveText("업무를 위한 실용 AI 기술 구축");
      await expect(harness.page.locator("#live-context")).toHaveText(
        "ChatGPT를 사용하기 전에 명확한 컨텍스트를 설정하세요."
      );
      await expect(harness.page.locator("#live-agents")).toHaveText(
        "재사용 가능한 프롬프트는 에이전트가 경계를 따르도록 돕습니다."
      );
      await expect(harness.page.locator("#live-review")).toHaveText(
        "검토 지점은 팀이 출력을 책임 있게 평가하도록 돕습니다."
      );
      await expect(harness.page.locator("#live-reflection-heading")).toHaveText("회고");
      await expect(harness.page.locator("#live-reflection")).toHaveText(
        "최종 결과물을 직접 통제하면서 AI에 무엇을 위임할지 결정하는 연습을 합니다."
      );
      await expect(harness.page.locator(".course-progress")).toContainText("4/7 Lessons Completed");
      await expect(harness.page.locator("#live-certificate")).toHaveText("Course Certificate");
      await expect(harness.page.locator("#live-quiz")).toHaveText("Knowledge Check");
      await expect(harness.page.locator("body > [role='status']")).toHaveText("Saved");
      await expect(harness.page.locator("#live-code")).toContainText("Do not translate code");
    } finally {
      await stopHarness(harness);
    }
  });
});
