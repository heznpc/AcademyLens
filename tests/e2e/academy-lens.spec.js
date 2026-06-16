const { test, expect } = require("@playwright/test");
const { closeExtension, launchExtension } = require("./helpers/extension");
const { startFixtureServer, stopFixtureServer } = require("./helpers/fixture-server");
const { registerTranslateStub } = require("./helpers/translate-stub");

async function waitForPanel(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector(".academylens-root");
    return Boolean(root && root.shadowRoot && root.shadowRoot.querySelector("[data-translate]"));
  });
}

async function clickPanelButton(page, selector) {
  await page.evaluate((innerSelector) => {
    document.querySelector(".academylens-root").shadowRoot.querySelector(innerSelector).click();
  }, selector);
}

async function expandPanel(page) {
  const collapsed = await page.evaluate(() => {
    const panel = document.querySelector(".academylens-root").shadowRoot.querySelector(".panel");
    return panel.dataset.collapsed === "true";
  });
  if (collapsed) {
    await clickPanelButton(page, "[data-collapse]");
  }
}

async function setPanelLanguage(page, language) {
  await page.evaluate((targetLanguage) => {
    const select = document.querySelector(".academylens-root").shadowRoot.querySelector("[data-language]");
    select.value = targetLanguage;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, language);
}

async function panelSnapshot(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".academylens-root");
    const shadow = root && root.shadowRoot;
    const select = shadow && shadow.querySelector("[data-language]");
    return {
      exists: Boolean(root),
      collapsed: shadow ? shadow.querySelector(".panel").dataset.collapsed : null,
      bodyVisible: shadow ? window.getComputedStyle(shadow.querySelector(".body")).display !== "none" : null,
      selected: select ? select.value : null,
      options: select ? Array.from(select.options).map((option) => option.textContent) : [],
      buttons: shadow ? Array.from(shadow.querySelectorAll("button")).map((button) => button.textContent.trim()) : [],
      actionButtons: shadow
        ? Array.from(shadow.querySelectorAll("[data-translate], [data-restore]")).map((button) =>
            button.textContent.trim()
          )
        : [],
      note: shadow ? shadow.querySelector("[data-language-note]").textContent : null,
      status: shadow ? shadow.querySelector("[data-status]").textContent : null
    };
  });
}

async function panelProgress(page) {
  return page.evaluate(() => {
    const shadow = document.querySelector(".academylens-root").shadowRoot;
    return {
      value: shadow.querySelector("[data-progress]").getAttribute("aria-valuenow"),
      status: shadow.querySelector("[data-status]").textContent
    };
  });
}

async function startHarness(options = {}) {
  const fixture = await startFixtureServer();
  const ext = await launchExtension();
  const calls = await registerTranslateStub(ext.context, options);
  const page = await ext.context.newPage();
  await page.goto(`${fixture.baseUrl}${options.path || "/course"}`);
  await waitForPanel(page);

  return { calls, ext, fixture, page };
}

async function stopHarness(harness) {
  if (harness.ext) await closeExtension(harness.ext);
  if (harness.fixture) await stopFixtureServer(harness.fixture.server);
}

test.describe("AcademyLens extension E2E", () => {
  test("loads the extension panel with native language labels", async () => {
    const harness = await startHarness();
    try {
      const snapshot = await panelSnapshot(harness.page);

      expect(snapshot.exists).toBe(true);
      expect(snapshot.collapsed).toBe("true");
      expect(snapshot.bodyVisible).toBe(false);
      expect(snapshot.selected).toBe("ko");
      expect(snapshot.options.slice(0, 10)).toEqual([
        "English",
        "한국어",
        "日本語",
        "中文(简体)",
        "中文(繁體)",
        "Español",
        "Français",
        "Italiano",
        "Deutsch",
        "Português (BR)"
      ]);
      expect(snapshot.actionButtons).toEqual(["번역", "원문 복원"]);
      expect(snapshot.note).toContain("용어 사전");
    } finally {
      await stopHarness(harness);
    }
  });

  test("collapse control hides and restores the full panel", async () => {
    const harness = await startHarness();
    try {
      await clickPanelButton(harness.page, "[data-collapse]");
      await expect.poll(async () => (await panelSnapshot(harness.page)).collapsed).toBe("false");
      let snapshot = await panelSnapshot(harness.page);
      expect(snapshot.bodyVisible).toBe(true);

      await clickPanelButton(harness.page, "[data-collapse]");
      await expect.poll(async () => (await panelSnapshot(harness.page)).collapsed).toBe("true");
      snapshot = await panelSnapshot(harness.page);
      expect(snapshot.bodyVisible).toBe(false);
    } finally {
      await stopHarness(harness);
    }
  });

  test("translates, preserves protected terms, applies reviewed glossary terms, and restores", async () => {
    const harness = await startHarness();
    try {
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");
      await expect(harness.page.locator("#title")).toHaveText("업무를 위한 실용 AI 기술 구축");
      await expect(harness.page.locator("#protected")).toHaveText(
        "OpenAI Academy 강의는 ChatGPT와 GPT-5를 사용합니다."
      );
      await expect(harness.page.locator("#terms")).toHaveText(
        "인공지능 워크플로는 팀이 에이전트를 구축하도록 돕습니다."
      );
      await expect(harness.page.locator("#technical")).toHaveText("JSON API 예제는 읽기 쉽게 유지됩니다.");
      await expect(harness.page.locator("#gradual-topbar")).toHaveText("Courses Search Account");
      await expect(harness.page.locator("#code")).toContainText("Do not translate code");

      await clickPanelButton(harness.page, "[data-restore]");
      await expect(harness.page.locator("#title")).toHaveText("Build practical AI skills for work");
      await expect(harness.page.locator("#protected")).toHaveText("OpenAI Academy courses use ChatGPT and GPT-5.");
    } finally {
      await stopHarness(harness);
    }
  });

  test("uses cache on the second translation pass", async () => {
    const harness = await startHarness();
    try {
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");
      await expect(harness.page.locator("#title")).toHaveText("업무를 위한 실용 AI 기술 구축");
      const firstPassCalls = harness.calls.length;
      expect(firstPassCalls).toBeGreaterThan(0);

      await clickPanelButton(harness.page, "[data-restore]");
      await expect(harness.page.locator("#title")).toHaveText("Build practical AI skills for work");

      await clickPanelButton(harness.page, "[data-translate]");
      await expect(harness.page.locator("#title")).toHaveText("업무를 위한 실용 AI 기술 구축");
      expect(harness.calls.length).toBe(firstPassCalls);
    } finally {
      await stopHarness(harness);
    }
  });

  test("does not let a late translate response overwrite restore", async () => {
    const harness = await startHarness({ delayMs: 400 });
    try {
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");
      await harness.page.waitForTimeout(50);
      await clickPanelButton(harness.page, "[data-restore]");
      await harness.page.waitForTimeout(900);

      await expect(harness.page.locator("#title")).toHaveText("Build practical AI skills for work");
      await expect(harness.page.locator("#protected")).toHaveText("OpenAI Academy courses use ChatGPT and GPT-5.");
    } finally {
      await stopHarness(harness);
    }
  });

  test("resets progress after translation failure", async () => {
    const harness = await startHarness({ failAll: true });
    try {
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");
      await expect
        .poll(async () => {
          const progress = await panelProgress(harness.page);
          return progress.status;
        })
        .toMatch(/실패|failed/i);
      const progress = await panelProgress(harness.page);
      expect(progress.value).toBe("0");
      await expect(harness.page.locator("#title")).toHaveText("Build practical AI skills for work");
    } finally {
      await stopHarness(harness);
    }
  });

  test("rapid language switching resolves to the final selected language", async () => {
    const harness = await startHarness({ delayMs: 250 });
    try {
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");
      await setPanelLanguage(harness.page, "ja");
      await clickPanelButton(harness.page, "[data-translate]");
      await setPanelLanguage(harness.page, "ko");
      await clickPanelButton(harness.page, "[data-translate]");

      await expect(harness.page.locator("#title")).toHaveText("업무를 위한 실용 AI 기술 구축");
      await harness.page.waitForTimeout(700);
      await expect(harness.page.locator("#title")).toHaveText("업무를 위한 실용 AI 기술 구축");
      await expect(harness.page.locator("#title")).not.toContainText("仕事");
    } finally {
      await stopHarness(harness);
    }
  });

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

  test("panel has viewport-safe visual smoke coverage on desktop and mobile sizes", async () => {
    const harness = await startHarness();
    try {
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 }
      ]) {
        await harness.page.setViewportSize(viewport);
        await harness.page.waitForTimeout(150);
        const box = await harness.page.evaluate(() => {
          const panel = document.querySelector(".academylens-root").shadowRoot.querySelector(".panel");
          const body = panel.querySelector(".body");
          const rect = panel.getBoundingClientRect();
          return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            collapsed: panel.dataset.collapsed,
            bodyVisible: window.getComputedStyle(body).display !== "none"
          };
        });
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(viewport.width);
        expect(box.bottom).toBeLessThanOrEqual(viewport.height);
        expect(box.width).toBeGreaterThan(200);
        expect(box.collapsed).toBe("true");
        expect(box.bodyVisible).toBe(false);

        const screenshot = await harness.page.screenshot();
        expect(screenshot.length).toBeGreaterThan(20000);
      }
    } finally {
      await stopHarness(harness);
    }
  });
});
