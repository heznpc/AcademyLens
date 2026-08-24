const {
  test,
  expect,
  startHarness,
  stopHarness,
  clickPanelButton,
  expandPanel,
  panelSnapshot,
  setNativeDownloads
} = require("./helpers/harness");

test.describe("AcademyLens providers E2E", () => {
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

  test("keeps glossary and inline placeholders on the native provider path", async () => {
    const harness = await startHarness({ browserTranslatorStub: "available" });
    try {
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");

      await expect(harness.page.locator("#protected")).toHaveText(
        "[native] OpenAI Academy courses use ChatGPT and GPT-5."
      );
      await expect(harness.page.locator("#inline")).toHaveText("[native] Use ChatGPT safely.");
      await expect(harness.page.locator("#inline strong")).toHaveText("ChatGPT");
      expect(harness.calls).toEqual([]);
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

  test("falls back when browser-native returns source-like output", async () => {
    const harness = await startHarness({ browserTranslatorStub: "copy" });
    try {
      await harness.page.evaluate(() => {
        document.querySelector("#lesson-main").innerHTML = `<p id="native-copy">Native copy fallback sentence</p>`;
      });
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");

      await expect(harness.page.locator("#native-copy")).toHaveText("[ko] Native copy fallback sentence");
      expect(harness.calls.map((call) => call.text)).toEqual(["Native copy fallback sentence"]);
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

  test("routes the selected Ollama model through the OpenAI-compatible local endpoint", async () => {
    const harness = await startHarness({
      translationEngine: "ollama",
      ollamaResponse: "[ollama] 로컬 모델 번역"
    });
    try {
      await harness.page.evaluate(() => {
        document.querySelector("#lesson-main").innerHTML = `<p id="ollama-only">Birds fly over hills</p>`;
      });
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");

      await expect(harness.page.locator("#ollama-only")).toHaveText("[ollama] 로컬 모델 번역");
      expect(harness.calls).toEqual([
        {
          provider: "ollama",
          model: "qwen3.5:4b",
          reasoningEffort: "none",
          text: "Birds fly over hills",
          targetLanguage: "ko"
        }
      ]);
      await expect.poll(async () => (await panelSnapshot(harness.page)).providerMode).toBe("ollama");
    } finally {
      await stopHarness(harness);
    }
  });

  test("recovers after the local Ollama endpoint reconnects", async () => {
    const harness = await startHarness({
      translationEngine: "ollama",
      ollamaResponse: "로컬 서버 재연결 번역",
      ollamaFailuresBeforeSuccess: 1
    });
    try {
      await harness.page.evaluate(() => {
        document.querySelector("#lesson-main").innerHTML = `<p id="ollama-reconnect">Reconnect the local server</p>`;
      });
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");
      await expect(harness.page.locator("#ollama-reconnect")).toHaveText("Reconnect the local server");

      await clickPanelButton(harness.page, "[data-translate]");
      await expect(harness.page.locator("#ollama-reconnect")).toHaveText("로컬 서버 재연결 번역");
      expect(harness.calls.filter((call) => call.provider === "ollama")).toHaveLength(2);
    } finally {
      await stopHarness(harness);
    }
  });

  test("restore wins over a delayed Ollama completion", async () => {
    const harness = await startHarness({
      translationEngine: "ollama",
      ollamaResponse: "늦게 도착한 로컬 번역",
      ollamaDelayMs: 1200
    });
    try {
      await harness.page.evaluate(() => {
        document.querySelector("#lesson-main").innerHTML = `<p id="ollama-cancel">Cancel the local request</p>`;
      });
      await expandPanel(harness.page);
      await clickPanelButton(harness.page, "[data-translate]");
      await expect.poll(() => harness.calls.filter((call) => call.provider === "ollama").length).toBe(1);
      await clickPanelButton(harness.page, "[data-restore]");
      await harness.page.waitForTimeout(1500);
      await expect(harness.page.locator("#ollama-cancel")).toHaveText("Cancel the local request");
    } finally {
      await stopHarness(harness);
    }
  });
});
