const { test, expect } = require("@playwright/test");
const manifest = require("../../manifest.json");
const { closeExtension, launchExtension } = require("./helpers/extension");
const { startFixtureServer, stopFixtureServer } = require("./helpers/fixture-server");
const { registerTranslateStub } = require("./helpers/translate-stub");

async function waitForPanel(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ready = await page
      .locator(".academylens-root")
      .waitFor({ state: "attached", timeout: 6000 })
      .then(async () =>
        page.evaluate(() => {
          const root = document.querySelector(".academylens-root");
          return Boolean(root && root.shadowRoot && root.shadowRoot.querySelector("[data-translate]"));
        })
      )
      .catch(() => false);
    if (ready) return;
    await page.reload({ waitUntil: "load" });
  }

  await page.locator(".academylens-root").waitFor({ state: "attached" });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.querySelector(".academylens-root");
        return Boolean(root && root.shadowRoot && root.shadowRoot.querySelector("[data-translate]"));
      })
    )
    .toBe(true);
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

async function setNativeDownloads(page, enabled) {
  await page.evaluate((value) => {
    const checkbox = document.querySelector(".academylens-root").shadowRoot.querySelector("[data-native-download]");
    checkbox.checked = value;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  }, enabled);
}

async function panelSnapshot(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".academylens-root");
    const shadow = root && root.shadowRoot;
    const select = shadow && shadow.querySelector("[data-language]");
    const body = shadow && shadow.querySelector(".body");
    return {
      exists: Boolean(root),
      collapsed: shadow ? shadow.querySelector(".panel").dataset.collapsed : null,
      bodyVisible: body ? !body.hasAttribute("inert") && body.getAttribute("aria-hidden") !== "true" : null,
      selected: select ? select.value : null,
      options: select ? Array.from(select.options).map((option) => option.textContent) : [],
      buttons: shadow ? Array.from(shadow.querySelectorAll("button")).map((button) => button.textContent.trim()) : [],
      actionButtons: shadow
        ? Array.from(shadow.querySelectorAll("[data-translate], [data-restore]")).map((button) =>
            button.textContent.trim()
          )
        : [],
      note: shadow ? shadow.querySelector("[data-language-note]").textContent : null,
      provider: shadow ? shadow.querySelector("[data-provider-chip]").textContent : null,
      providerMode: root ? root.dataset.provider : null,
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
  const ext = await launchExtension({ browserTranslatorStub: options.browserTranslatorStub });
  const calls = await registerTranslateStub(ext.context, options);
  const page = await ext.context.newPage();
  await page.goto(`${fixture.baseUrl}${options.path || "/course"}`);
  await waitForPanel(page);

  return { calls, ext, fixture, page };
}

async function waitForFrame(page, pattern) {
  await expect.poll(() => page.frames().some((frame) => pattern.test(frame.url()))).toBe(true);
  return page.frames().find((frame) => pattern.test(frame.url()));
}

async function stopHarness(harness) {
  if (harness.ext) await closeExtension(harness.ext);
  if (harness.fixture) await stopFixtureServer(harness.fixture.server);
}

async function savePanelCorrection(page, value) {
  await page.evaluate((translated) => {
    const shadow = document.querySelector(".academylens-root").shadowRoot;
    const input = shadow.querySelector("[data-correction-input]");
    input.value = translated;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    shadow.querySelector("[data-save-correction]").click();
  }, value);
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
      expect(snapshot.note).toContain("용어");
      expect(snapshot.provider).toBeTruthy();
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

  test("popup settings live-sync to the open Academy page", async () => {
    const harness = await startHarness();
    try {
      await expandPanel(harness.page);
      const popup = await harness.ext.context.newPage();
      await popup.goto(`chrome-extension://${harness.ext.extensionId}/src/popup/popup.html`);
      await popup.selectOption("#targetLanguage", "ja");
      await popup.close();

      await expect.poll(async () => (await panelSnapshot(harness.page)).selected).toBe("ja");
      await clickPanelButton(harness.page, "[data-translate]");
      await expect(harness.page.locator("#title")).toHaveText("仕事に役立つ実践的なAIスキルを身につける");
    } finally {
      await stopHarness(harness);
    }
  });

  test("uses browser-native provider before Google fallback when available", async () => {
    const harness = await startHarness({ browserTranslatorStub: "available" });
    try {
      await harness.page.evaluate(() => {
        document.querySelector("#lesson-main").innerHTML = `<p id="native-only">Native provider unique sentence</p>`;
      });
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");

      await expect(harness.page.locator("#native-only")).toHaveText("[native] Native provider unique sentence");
      expect(harness.calls.some((call) => call.text.includes("Native provider unique sentence"))).toBe(false);
      await expect.poll(async () => (await panelSnapshot(harness.page)).providerMode).toBe("native");
    } finally {
      await stopHarness(harness);
    }
  });

  test("falls back only for native provider misses", async () => {
    const harness = await startHarness({ browserTranslatorStub: "partial" });
    try {
      await harness.page.evaluate(() => {
        document.querySelector("#lesson-main").innerHTML = `
          <p id="native-hit">Native provider keeps this sentence</p>
          <p id="native-miss">Native fallback miss sentence</p>
        `;
      });
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");

      await expect(harness.page.locator("#native-hit")).toHaveText("[native] Native provider keeps this sentence");
      await expect(harness.page.locator("#native-miss")).toHaveText("[ko] Native fallback miss sentence");
      expect(harness.calls.map((call) => call.text)).toEqual(["Native fallback miss sentence"]);
    } finally {
      await stopHarness(harness);
    }
  });

  test("uses downloadable browser-native provider only after explicit opt-in", async () => {
    const harness = await startHarness({ browserTranslatorStub: "downloadable" });
    try {
      await harness.page.evaluate(() => {
        document.querySelector("#lesson-main").innerHTML =
          `<p id="downloadable-native">Downloadable native sentence</p>`;
      });
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");

      await expect(harness.page.locator("#downloadable-native")).toHaveText("[ko] Downloadable native sentence");
      expect(harness.calls.map((call) => call.text)).toEqual(["Downloadable native sentence"]);

      await clickPanelButton(harness.page, "[data-restore]");
      await expect(harness.page.locator("#downloadable-native")).toHaveText("Downloadable native sentence");
      await harness.page.locator("#downloadable-native").evaluate((node) => {
        node.textContent = "Downloadable native second sentence";
      });
      harness.calls.length = 0;
      await setNativeDownloads(harness.page, true);
      await expect.poll(async () => (await panelSnapshot(harness.page)).providerMode).toBe("nativeDownloading");
      await clickPanelButton(harness.page, "[data-translate]");

      await expect(harness.page.locator("#downloadable-native")).toHaveText(
        "[native] Downloadable native second sentence"
      );
      expect(harness.calls).toEqual([]);
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
      await expect(harness.page.locator("[role='status']")).toHaveText("Saved");
      await expect(harness.page.locator("#live-code")).toContainText("Do not translate code");
    } finally {
      await stopHarness(harness);
    }
  });

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

  test("panel has viewport-safe visual smoke coverage on desktop and mobile sizes", async () => {
    const harness = await startHarness();
    try {
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 }
      ]) {
        await harness.page.setViewportSize(viewport);
        await harness.page.waitForTimeout(150);
        const readPanelMetrics = () => {
          const panel = document.querySelector(".academylens-root").shadowRoot.querySelector(".panel");
          const host = document.querySelector(".academylens-root");
          const body = panel.querySelector(".body");
          const name = panel.querySelector(".name");
          const select = panel.querySelector("[data-language]");
          const primary = panel.querySelector("[data-translate]");
          const top = panel.querySelector(".top");
          const rect = panel.getBoundingClientRect();
          const nameStyle = window.getComputedStyle(name);
          const selectStyle = window.getComputedStyle(select);
          const buttonStyle = window.getComputedStyle(primary);
          return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            hostVersion: host.dataset.version,
            panelVersion: panel.dataset.version,
            browserTranslatorStatus: host.dataset.browserTranslator,
            collapsed: panel.dataset.collapsed,
            bodyVisible: !body.hasAttribute("inert") && body.getAttribute("aria-hidden") !== "true",
            nameFontSize: Number.parseFloat(nameStyle.fontSize),
            selectFontSize: Number.parseFloat(selectStyle.fontSize),
            buttonFontSize: Number.parseFloat(buttonStyle.fontSize),
            topHeight: top.getBoundingClientRect().height,
            selectHeight: select.getBoundingClientRect().height,
            primaryHeight: primary.getBoundingClientRect().height
          };
        };
        const box = await harness.page.evaluate(readPanelMetrics);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(viewport.width);
        expect(box.bottom).toBeLessThanOrEqual(viewport.height);
        expect(box.width).toBeGreaterThanOrEqual(52);
        expect(box.width).toBeLessThanOrEqual(72);
        expect(box.hostVersion).toBe(manifest.version);
        expect(box.panelVersion).toBe(manifest.version);
        expect(["checking", "unsupported", "unavailable", "available", "downloadable", "downloading"]).toContain(
          box.browserTranslatorStatus
        );
        expect(box.topHeight).toBeGreaterThanOrEqual(52);
        expect(box.collapsed).toBe("true");
        expect(box.bodyVisible).toBe(false);

        await clickPanelButton(harness.page, "[data-collapse]");
        await harness.page.waitForTimeout(250);
        const expandedBox = await harness.page.evaluate(readPanelMetrics);
        expect(expandedBox.left).toBeGreaterThanOrEqual(0);
        expect(expandedBox.top).toBeGreaterThanOrEqual(0);
        expect(expandedBox.right).toBeLessThanOrEqual(viewport.width);
        expect(expandedBox.bottom).toBeLessThanOrEqual(viewport.height);
        expect(expandedBox.width).toBeGreaterThanOrEqual(viewport.width > 600 ? 400 : 330);
        expect(expandedBox.topHeight).toBeGreaterThanOrEqual(54);
        expect(expandedBox.nameFontSize).toBeGreaterThanOrEqual(15);
        expect(expandedBox.selectFontSize).toBeGreaterThanOrEqual(14.25);
        expect(expandedBox.buttonFontSize).toBeGreaterThanOrEqual(14.25);
        expect(expandedBox.selectHeight).toBeGreaterThanOrEqual(42);
        expect(expandedBox.primaryHeight).toBeGreaterThanOrEqual(42);
        expect(expandedBox.collapsed).toBe("false");
        expect(expandedBox.bodyVisible).toBe(true);

        const screenshot = await harness.page.screenshot();
        expect(screenshot.length).toBeGreaterThan(20000);

        await clickPanelButton(harness.page, "[data-collapse]");
        await harness.page.waitForTimeout(150);
      }
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

      await expect(harness.page.locator("#chunk-0")).toHaveText("[ko] Chunked translation sample 0");
      await expect(harness.page.locator("#chunk-119")).toHaveText("[ko] Chunked translation sample 119");
      await expect(harness.page.locator("#chunk-144")).toHaveText("[ko] Chunked translation sample 144");
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

      await expect(harness.page.locator("#visible-priority")).toHaveText("[ko] Viewport priority 레슨");
      await expect
        .poll(() => harness.calls.findIndex((call) => call.text.includes("sample 0")))
        .toBeGreaterThanOrEqual(0);
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
