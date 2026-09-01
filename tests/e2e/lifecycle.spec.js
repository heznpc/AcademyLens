const {
  test,
  expect,
  startHarness,
  stopHarness,
  clickPanelButton,
  expandPanel,
  setAutoTranslate,
  translationCacheState
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

      await expect(harness.page.locator("#overflow-copy")).toHaveText("번역된 강의 문장");
      expect(harness.calls.some((call) => call.text.includes("large interface render"))).toBe(true);
      expect(harness.calls.some((call) => /Burst control/.test(call.text))).toBe(false);
    } finally {
      await stopHarness(harness);
    }
  });

  test("resumes settings, DOM observation, and SPA handling after a real BFCache restore", async () => {
    const harness = await startHarness({ enableBackForwardCache: true });
    try {
      await harness.page.evaluate(() => {
        window.__academyLensPageTransitions = [];
        window.addEventListener("pagehide", (event) => {
          window.__academyLensPageTransitions.push(`hide:${event.persisted}`);
        });
        window.addEventListener("pageshow", (event) => {
          window.__academyLensPageTransitions.push(`show:${event.persisted}`);
        });
      });

      await harness.page.goto(`${harness.fixture.baseUrl}/lesson-2`);
      let [worker] = harness.ext.context.serviceWorkers();
      if (!worker) worker = await harness.ext.context.waitForEvent("serviceworker");
      const cacheEpochAfterClear = await worker.evaluate(async () => {
        const cacheKey = "academylens.translationCache.v1";
        const epochKey = "academylens.translationCacheEpoch.v1";
        const stored = await chrome.storage.local.get([epochKey]);
        const nextEpoch = (Number(stored[epochKey]) || 0) + 1;
        await chrome.storage.local.set({
          [cacheKey]: {},
          [epochKey]: nextEpoch
        });
        return nextEpoch;
      });
      await harness.page.evaluate(() => history.back());
      await expect(harness.page).toHaveURL(`${harness.fixture.baseUrl}/course`);
      await expect(harness.page.locator("#title")).toHaveText("Build practical AI skills for work");
      await expect
        .poll(() => harness.page.evaluate(() => window.__academyLensPageTransitions || []))
        .toEqual(["hide:true", "show:true"]);

      await worker.evaluate(async () => {
        const key = "academylens.settings";
        const stored = await chrome.storage.local.get([key]);
        await chrome.storage.local.set({
          [key]: {
            ...(stored[key] || {}),
            autoTranslate: true
          }
        });
      });
      await expect
        .poll(() =>
          harness.page.evaluate(
            () => document.querySelector(".academylens-root").shadowRoot.querySelector("[data-auto-translate]").checked
          )
        )
        .toBe(true);

      await harness.page.evaluate(() => {
        const copy = document.createElement("p");
        copy.id = "bfcache-copy";
        copy.textContent = "Translation added after browser history restore.";
        document.querySelector("#lesson-main").append(copy);
      });
      await expect(harness.page.locator("#bfcache-copy")).toHaveText("번역된 강의 문장");
      await expect
        .poll(async () => {
          const cache = await translationCacheState(harness.ext.context);
          return cache.epoch === cacheEpochAfterClear && cache.size > 0;
        })
        .toBe(true);

      await harness.page.evaluate(() => window.__replaceWithLessonTwo());
      await expect(harness.page.locator("#title")).toHaveText("고급 프롬프트 엔지니어링");
    } finally {
      await stopHarness(harness);
    }
  });

  test("auto-translate keeps a site mutation emitted during translation-write suppression", async () => {
    const harness = await startHarness();
    try {
      await harness.page.evaluate(() => {
        const title = document.querySelector("#title");
        const observer = new MutationObserver(() => {
          if (document.querySelector("#suppressed-site-copy")) return;
          const copy = document.createElement("p");
          copy.id = "suppressed-site-copy";
          copy.textContent = "Site lesson update emitted during translation rendering.";
          document.querySelector("#lesson-main").append(copy);
          observer.disconnect();
        });
        observer.observe(title, { characterData: true, childList: true, subtree: true });
      });

      await setAutoTranslate(harness.page, true);
      await expect(harness.page.locator("#title")).toHaveText("업무를 위한 실용 AI 기술 구축");
      await expect(harness.page.locator("#suppressed-site-copy")).toHaveText("번역된 강의 문장 레슨");
      expect(harness.calls.some((call) => call.text.includes("emitted during translation rendering"))).toBe(true);
    } finally {
      await stopHarness(harness);
    }
  });

  test("restore writes do not trigger auto-translation again", async () => {
    const harness = await startHarness();
    try {
      await setAutoTranslate(harness.page, true);
      await expect(harness.page.locator("#title")).toHaveText("업무를 위한 실용 AI 기술 구축");
      await harness.page.waitForTimeout(500);
      const callsBeforeRestore = harness.calls.length;

      await clickPanelButton(harness.page, "[data-restore]");
      await expect(harness.page.locator("#title")).toHaveText("Build practical AI skills for work");
      await harness.page.waitForTimeout(1800);

      await expect(harness.page.locator("#title")).toHaveText("Build practical AI skills for work");
      expect(harness.calls.length).toBe(callsBeforeRestore);
    } finally {
      await stopHarness(harness);
    }
  });

  test("shows a localized failure instead of a provider's internal error", async () => {
    const harness = await startHarness({ failAll: true });
    try {
      await expandPanel(harness.page);
      await harness.page.evaluate(() => {
        document.querySelector("#lesson-main").innerHTML =
          '<p id="failure-copy">People write clear summaries after each meeting.</p>';
      });
      await clickPanelButton(harness.page, "[data-translate]");
      await expect
        .poll(() =>
          harness.page.evaluate(
            () => document.querySelector(".academylens-root").shadowRoot.querySelector("[data-status]").textContent
          )
        )
        .toBe("번역에 실패했습니다.");
    } finally {
      await stopHarness(harness);
    }
  });
});
