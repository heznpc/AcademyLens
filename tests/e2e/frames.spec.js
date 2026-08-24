const {
  test,
  expect,
  startHarness,
  waitForFrame,
  stopHarness,
  clickPanelButton,
  expandPanel,
  panelSnapshot
} = require("./helpers/harness");

test.describe("AcademyLens frames E2E", () => {
  test("translates nested SCORM lesson content from the top-level panel", async () => {
    const harness = await startHarness({ path: "/learn/ai-foundations-juzjs/lessons" });
    try {
      await expandPanel(harness.page);
      const scormFrame = await waitForFrame(harness.page, /scormcontent\/index\.html/);
      await expect(scormFrame.locator("#scorm-title")).toHaveText("AI Foundations");
      await expect(harness.page.locator(".academylens-root")).toHaveCount(1);

      await clickPanelButton(harness.page, "[data-translate]");
      await expect(scormFrame.locator("#scorm-title")).toHaveText("AI 기초");
      await expect(scormFrame.locator("#scorm-start")).toHaveText("START COURSE");
      await expect(scormFrame.locator("#scorm-body")).toHaveText(
        "이 과정은 AI와 ChatGPT를 안전하게 사용하기 위한 기반을 구축하도록 설계되었습니다."
      );
      await expect(scormFrame.locator("#scorm-llm")).toHaveText(
        "대규모 언어 모델은 사람들이 책임 있는 검토를 연습하도록 돕습니다."
      );
      await expect.poll(async () => (await panelSnapshot(harness.page)).status).toMatch(/페이지 텍스트|임베드/);
      await expect(harness.page.locator("#gradual-topbar")).toContainText("Home");
      await expect(harness.page.locator("#gradual-topbar")).toContainText("Study Room");

      await clickPanelButton(harness.page, "[data-restore]");
      await expect(scormFrame.locator("#scorm-title")).toHaveText("AI Foundations");
      await expect(scormFrame.locator("#scorm-body")).toHaveText(
        "This course is designed to build foundations for using AI and ChatGPT safely."
      );
    } finally {
      await stopHarness(harness);
    }
  });

  test("ignores forged frame commands without the AcademyLens frame token", async () => {
    const harness = await startHarness({ path: "/learn/ai-foundations-juzjs/lessons" });
    try {
      await expandPanel(harness.page);
      const scormFrame = await waitForFrame(harness.page, /scormcontent\/index\.html/);
      await expect(scormFrame.locator("#scorm-body")).toHaveText(
        "This course is designed to build foundations for using AI and ChatGPT safely."
      );

      await harness.page.evaluate(() => {
        const frame = document.querySelector("#scorm-driver");
        frame.contentWindow.postMessage(
          {
            source: "AcademyLens",
            action: "translate",
            messageId: "forged-message",
            targetLanguage: "ko",
            generation: 999,
            pageUrl: location.href,
            routeVersion: 0
          },
          location.origin
        );
        window.postMessage(
          {
            source: "AcademyLens",
            action: "frameResult",
            messageId: "forged-result",
            kind: "translate",
            applied: 99,
            failed: 0
          },
          location.origin
        );
      });

      await harness.page.waitForTimeout(700);
      await expect(scormFrame.locator("#scorm-body")).toHaveText(
        "This course is designed to build foundations for using AI and ChatGPT safely."
      );
      await expect.poll(async () => (await panelSnapshot(harness.page)).status).not.toMatch(/99|임베드.*99/);
      expect(harness.calls).toEqual([]);
    } finally {
      await stopHarness(harness);
    }
  });

  test("translates late-loading nested SCORM frames after an early Translate click", async () => {
    const harness = await startHarness({ path: "/learn/ai-foundations-juzjs/lessons-delayed" });
    try {
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");
      const scormFrame = await waitForFrame(harness.page, /scormcontent\/index\.html/);

      await expect(scormFrame.locator("#scorm-title")).toHaveText("AI 기초");
      await expect(scormFrame.locator("#scorm-body")).toHaveText(
        "이 과정은 AI와 ChatGPT를 안전하게 사용하기 위한 기반을 구축하도록 설계되었습니다."
      );
    } finally {
      await stopHarness(harness);
    }
  });

  test("translates SCORM content after in-frame lesson navigation", async () => {
    const harness = await startHarness({ path: "/learn/ai-foundations-juzjs/lessons" });
    try {
      await expandPanel(harness.page);
      const scormFrame = await waitForFrame(harness.page, /scormcontent\/index\.html/);
      await scormFrame.locator("#scorm-start").click();
      await expect(scormFrame.locator("#scorm-lesson-title")).toHaveText("1.1 Welcome to AI Foundations");

      await clickPanelButton(harness.page, "[data-translate]");
      await expect(scormFrame.locator("#scorm-lesson-title")).toHaveText("1.1 AI 기초에 오신 것을 환영합니다");
      await expect(scormFrame.locator("#scorm-lesson-caption")).toHaveText("강의에 오신 것을 환영합니다.");
      await expect(scormFrame.locator("#scorm-skip")).toHaveText("SKIP TO LESSON");
      await expect(scormFrame.locator("#scorm-continue")).toHaveText("CONTINUE");
      await expect(scormFrame.locator("#scorm-media")).toBeVisible();
      await expect(harness.page.locator("#gradual-topbar")).toContainText("Study Room");

      await clickPanelButton(harness.page, "[data-restore]");
      await expect(scormFrame.locator("#scorm-lesson-title")).toHaveText("1.1 Welcome to AI Foundations");
      await expect(scormFrame.locator("#scorm-lesson-caption")).toHaveText("Welcome to the course.");
    } finally {
      await stopHarness(harness);
    }
  });

  test("reports embedded frame translation failures from the top-level panel", async () => {
    const harness = await startHarness({ path: "/learn/ai-foundations-juzjs/lessons", failAll: true });
    try {
      await expandPanel(harness.page);
      const scormFrame = await waitForFrame(harness.page, /scormcontent\/index\.html/);
      await clickPanelButton(harness.page, "[data-translate]");

      await expect.poll(async () => (await panelSnapshot(harness.page)).status, { timeout: 15000 }).toMatch(/실패/);
      await expect(scormFrame.locator("#scorm-body")).toHaveText(
        "This course is designed to build foundations for using AI and ChatGPT safely."
      );
    } finally {
      await stopHarness(harness);
    }
  });
});
