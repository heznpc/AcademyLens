const {
  test,
  expect,
  translationCacheState,
  translationCacheSize,
  startHarness,
  stopHarness,
  clickPanelButton,
  expandPanel,
  panelProgress,
  panelSnapshot,
  savePanelCorrection,
  setPanelLanguage,
  waitForTranslationFinished
} = require("./helpers/harness");

test.describe("AcademyLens translation E2E", () => {
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
      await expect(harness.page.locator("#inline")).toHaveText("ChatGPT를 안전하게 사용하세요.");
      await expect(harness.page.locator("#inline strong")).toHaveText("ChatGPT");
      await expect(harness.page.locator("#gradual-topbar")).toHaveText("Courses Search Account");
      await expect(harness.page.locator("#code")).toContainText("Do not translate code");

      await clickPanelButton(harness.page, "[data-restore]");
      await expect(harness.page.locator("#title")).toHaveText("Build practical AI skills for work");
      await expect(harness.page.locator("#protected")).toHaveText("OpenAI Academy courses use ChatGPT and GPT-5.");
      await expect(harness.page.locator("#inline strong")).toHaveText("ChatGPT");
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
      await expect(harness.page.locator("#protected")).toHaveText(
        "OpenAI Academy 강의는 ChatGPT와 GPT-5를 사용합니다."
      );
      const firstPassCalls = harness.calls.length;
      expect(firstPassCalls).toBeGreaterThan(0);

      await clickPanelButton(harness.page, "[data-restore]");
      await expect(harness.page.locator("#title")).toHaveText("Build practical AI skills for work");

      await clickPanelButton(harness.page, "[data-translate]");
      await expect(harness.page.locator("#title")).toHaveText("업무를 위한 실용 AI 기술 구축");
      await expect(harness.page.locator("#protected")).toHaveText(
        "OpenAI Academy 강의는 ChatGPT와 GPT-5를 사용합니다."
      );
      await waitForTranslationFinished(harness.page);
      expect(harness.calls.length).toBe(firstPassCalls);
      expect(await translationCacheSize(harness.ext.context)).toBeGreaterThan(0);

      await clickPanelButton(harness.page, "[data-clear-cache]");
      await expect.poll(async () => (await panelSnapshot(harness.page)).status).toMatch(/한 번 더|confirm/i);
      expect(await translationCacheSize(harness.ext.context)).toBeGreaterThan(0);
      await clickPanelButton(harness.page, "[data-clear-cache]");
      await expect.poll(async () => (await panelSnapshot(harness.page)).status).toMatch(/캐시/);
      expect(await translationCacheSize(harness.ext.context)).toBe(0);
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

  test("restore does not overwrite Academy text that changed in place after translation", async () => {
    const harness = await startHarness();
    try {
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");
      await expect(harness.page.locator("#title")).toHaveText("업무를 위한 실용 AI 기술 구축");

      await harness.page.evaluate(() => {
        document.querySelector("#title").firstChild.textContent = "Updated Academy lesson";
      });
      await clickPanelButton(harness.page, "[data-restore]");

      await expect(harness.page.locator("#title")).toHaveText("Updated Academy lesson");
    } finally {
      await stopHarness(harness);
    }
  });

  test("saves a local correction and reapplies it on the next translation", async () => {
    const harness = await startHarness();
    try {
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");
      await expect(harness.page.locator("#title")).toHaveText("업무를 위한 실용 AI 기술 구축");

      await harness.page.locator("#title").click();
      await expect
        .poll(async () =>
          harness.page.evaluate(() => {
            const correction = document
              .querySelector(".academylens-root")
              .shadowRoot.querySelector("[data-correction]");
            return correction.dataset.active;
          })
        )
        .toBe("true");
      await savePanelCorrection(harness.page, "업무용 AI 실전 역량 만들기");
      await expect(harness.page.locator("#title")).toHaveText("업무용 AI 실전 역량 만들기");

      await clickPanelButton(harness.page, "[data-restore]");
      await expect(harness.page.locator("#title")).toHaveText("Build practical AI skills for work");
      await clickPanelButton(harness.page, "[data-translate]");
      await expect(harness.page.locator("#title")).toHaveText("업무용 AI 실전 역량 만들기");
      await waitForTranslationFinished(harness.page);
      await expect.poll(async () => (await panelSnapshot(harness.page)).correctionCount).toBe("(1)");

      await clickPanelButton(harness.page, "[data-delete-correction]");
      await expect.poll(async () => (await panelSnapshot(harness.page)).status).toMatch(/한 번 더|confirm/i);
      await expect.poll(async () => (await panelSnapshot(harness.page)).correctionCount).toBe("(1)");
      await clickPanelButton(harness.page, "[data-delete-correction]");
      await expect.poll(async () => (await panelSnapshot(harness.page)).correctionCount).toBe("(0)");
      await expect(harness.page.locator("#title")).toHaveText("업무를 위한 실용 AI 기술 구축");
    } finally {
      await stopHarness(harness);
    }
  });

  test("requires confirmation before clearing all local corrections", async () => {
    const harness = await startHarness();
    try {
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");
      await expect(harness.page.locator("#title")).toHaveText("업무를 위한 실용 AI 기술 구축");

      await harness.page.locator("#title").click();
      await savePanelCorrection(harness.page, "업무용 AI 실전 역량 만들기");
      await expect.poll(async () => (await panelSnapshot(harness.page)).correctionCount).toBe("(1)");

      await clickPanelButton(harness.page, "[data-clear-corrections]");
      await expect.poll(async () => (await panelSnapshot(harness.page)).status).toMatch(/한 번 더|confirm/i);
      await expect.poll(async () => (await panelSnapshot(harness.page)).correctionCount).toBe("(1)");

      await clickPanelButton(harness.page, "[data-clear-corrections]");
      await expect.poll(async () => (await panelSnapshot(harness.page)).correctionCount).toBe("(0)");
      await expect(harness.page.locator("#title")).toHaveText("업무를 위한 실용 AI 기술 구축");
    } finally {
      await stopHarness(harness);
    }
  });

  test("does not repopulate cleared cache from an in-flight translation", async () => {
    const harness = await startHarness({ delayMs: 450 });
    try {
      await expandPanel(harness.page);
      const initialCache = await translationCacheState(harness.ext.context);
      await clickPanelButton(harness.page, "[data-translate]");
      await harness.page.waitForTimeout(50);
      await clickPanelButton(harness.page, "[data-clear-cache]");
      await expect.poll(async () => (await panelSnapshot(harness.page)).status).toMatch(/한 번 더|confirm/i);
      await clickPanelButton(harness.page, "[data-clear-cache]");
      await expect
        .poll(
          async () => {
            const cache = await translationCacheState(harness.ext.context);
            return cache.epoch > initialCache.epoch && cache.size === 0;
          },
          { timeout: 30_000 }
        )
        .toBe(true);

      await expect(harness.page.locator("#title")).toHaveText("업무를 위한 실용 AI 기술 구축");
      await harness.page.waitForTimeout(500);
      await expect
        .poll(async () => (await translationCacheState(harness.ext.context)).size, { timeout: 30_000 })
        .toBe(0);
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
      await expect(harness.page.locator("#title")).toHaveText("업무를 위한 실용 AI 기술 구축");
      await expect(harness.page.locator("#protected")).toHaveText("OpenAI Academy courses use ChatGPT and GPT-5.");
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

  test("continues translation past one text-node pass", async () => {
    const harness = await startHarness();
    try {
      await harness.page.evaluate(() => {
        const main = document.querySelector("#lesson-main");
        main.innerHTML = Array.from(
          { length: 145 },
          (_, index) => `<p id="chunk-${index}">Chunked translation sample ${index}</p>`
        ).join("");
      });
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");

      await expect(harness.page.locator("#chunk-0")).toHaveText("번역된 강의 문장 0");
      await expect(harness.page.locator("#chunk-119")).toHaveText("번역된 강의 문장 119");
      await expect(harness.page.locator("#chunk-144")).toHaveText("번역된 강의 문장 144");
      expect(harness.calls.filter((call) => call.text.startsWith("Chunked translation sample")).length).toBe(145);
    } finally {
      await stopHarness(harness);
    }
  });

  test("prioritizes visible lesson text before offscreen text", async () => {
    const harness = await startHarness();
    try {
      await harness.page.evaluate(() => {
        const main = document.querySelector("#lesson-main");
        main.innerHTML = `
          ${Array.from({ length: 130 }, (_, index) => `<p>Offscreen lesson sample ${index}</p>`).join("")}
          <p id="visible-priority">Viewport priority lesson</p>
          <p id="below-priority">Below viewport lesson</p>
        `;
        document.querySelector("#visible-priority").scrollIntoView({ block: "center" });
      });
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");

      await expect(harness.page.locator("#visible-priority")).toHaveText("번역된 강의 문장 레슨");
      await expect
        .poll(() => harness.calls.findIndex((call) => call.text.includes("sample 0")))
        .toBeGreaterThanOrEqual(0);
      await expect.poll(async () => (await panelSnapshot(harness.page)).diagnostics).toMatch(/캐시|묶음/);
      const visibleIndex = harness.calls.findIndex((call) => call.text.startsWith("Viewport priority"));
      const farOffscreenIndex = harness.calls.findIndex((call) => call.text.includes("sample 0"));
      expect(visibleIndex).toBeGreaterThanOrEqual(0);
      expect(farOffscreenIndex).toBeGreaterThanOrEqual(0);
      expect(visibleIndex).toBeLessThan(farOffscreenIndex);
    } finally {
      await stopHarness(harness);
    }
  });
});
