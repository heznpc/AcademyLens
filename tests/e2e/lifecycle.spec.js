const {
  test,
  expect,
  startHarness,
  stopHarness,
  clickPanelButton,
  expandPanel,
  setAutoTranslate
} = require("./helpers/harness");

test.describe("AcademyLens lifecycle E2E", () => {
  test("SPA navigation clears stale translations and translates the new route", async () => {
    const harness = await startHarness();
    try {
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");
      await expect(harness.page.locator("#title")).toHaveText("업무를 위한 실용 AI 기술 구축");

      await harness.page.evaluate(() => window.__replaceWithLessonTwo());
      await expect(harness.page.locator("#title")).toHaveText("Advanced prompt engineering");
      await expect(harness.page.locator("body")).not.toContainText("업무를 위한 실용 AI 기술 구축");

      await clickPanelButton(harness.page, "[data-translate]");
      await expect(harness.page.locator("#title")).toHaveText("고급 프롬프트 엔지니어링");
      await expect(harness.page.locator("#protected")).toHaveText(
        "OpenAI Academy 강의는 JSON 및 SDK 예제를 사용합니다."
      );
    } finally {
      await stopHarness(harness);
    }
  });

  test("auto-translate handles new lesson text without touching newly added platform controls", async () => {
    const harness = await startHarness();
    try {
      await expandPanel(harness.page);
      await setAutoTranslate(harness.page, true);
      harness.calls.length = 0;

      await harness.page.evaluate(() => {
        const main = document.querySelector("#lesson-main");
        const section = document.createElement("section");
        section.id = "auto-section";
        section.innerHTML = `
          <p id="auto-copy">Review points help teams evaluate outputs responsibly.</p>
          <div class="course-progress" role="progressbar">3/5 Lessons Completed</div>
          <button id="auto-control">Continue</button>
        `;
        main.append(section);
      });

      await expect(harness.page.locator("#auto-copy")).toHaveText(
        "검토 지점은 팀이 출력을 책임 있게 평가하도록 돕습니다."
      );
      await expect(harness.page.locator("#auto-control")).toHaveText("Continue");
      await expect(harness.page.locator(".course-progress")).toContainText("3/5 Lessons Completed");
      expect(harness.calls.some((call) => call.text.includes("help teams evaluate"))).toBe(true);
      expect(harness.calls.some((call) => /Continue|Lessons Completed/.test(call.text))).toBe(false);
    } finally {
      await stopHarness(harness);
    }
  });

  test("auto-translate rescans a mutation burst beyond the pending-node cap", async () => {
    const harness = await startHarness();
    try {
      await expandPanel(harness.page);
      await setAutoTranslate(harness.page, true);
      await expect(harness.page.locator("#title")).toHaveText("업무를 위한 실용 AI 기술 구축");
      await harness.page.waitForTimeout(350);
      harness.calls.length = 0;

      await harness.page.evaluate(() => {
        const fragment = document.createDocumentFragment();
        for (let index = 0; index < 85; index += 1) {
          const control = document.createElement("button");
          control.textContent = `Burst control ${index}`;
          fragment.append(control);
        }
        const lesson = document.createElement("section");
        lesson.innerHTML = '<p id="overflow-copy">Translation that appears after a large interface render.</p>';
        fragment.append(lesson);
        document.querySelector("#lesson-main").append(fragment);
      });

      await expect(harness.page.locator("#overflow-copy")).toHaveText(
        "[ko] Translation that appears after a large interface render."
      );
      expect(harness.calls.some((call) => call.text.includes("large interface render"))).toBe(true);
      expect(harness.calls.some((call) => /Burst control/.test(call.text))).toBe(false);
    } finally {
      await stopHarness(harness);
    }
  });
});
