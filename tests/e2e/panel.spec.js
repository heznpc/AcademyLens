const {
  test,
  expect,
  manifest,
  startHarness,
  stopHarness,
  clickPanelButton,
  panelSnapshot
} = require("./helpers/harness");

test.describe("AcademyLens panel E2E", () => {
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
      expect(snapshot.statusRole).toBe("status");
      expect(snapshot.statusLive).toBe("polite");
      expect(snapshot.statusAtomic).toBe("true");
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

  test("panel geometry stays viewport-safe on desktop and mobile sizes", async () => {
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
        expect([
          "checking",
          "not-selected",
          "unsupported",
          "unavailable",
          "available",
          "downloadable",
          "downloading"
        ]).toContain(box.browserTranslatorStatus);
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

  test("keeps the collapsed panel above a bottom privacy overlay", async () => {
    const harness = await startHarness();
    try {
      await harness.page.setViewportSize({ width: 1280, height: 820 });
      await harness.page.evaluate(() => {
        const overlay = document.createElement("div");
        overlay.id = "privacy-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.style.cssText = [
          "position:fixed",
          "left:0",
          "right:0",
          "bottom:0",
          "height:116px",
          "background:#fff",
          "z-index:2147483646",
          "border-top:1px solid #ddd"
        ].join(";");
        overlay.textContent = "We use cookies. Manage preferences. Accept all.";
        document.body.append(overlay);
      });
      await harness.page.waitForTimeout(700);

      const metrics = await harness.page.evaluate(() => {
        const panel = document.querySelector(".academylens-root").shadowRoot.querySelector(".panel");
        const overlay = document.querySelector("#privacy-overlay");
        const panelRect = panel.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();
        return {
          panelBottom: panelRect.bottom,
          overlayTop: overlayRect.top,
          bottomOverlay: panel.dataset.bottomOverlay
        };
      });
      expect(metrics.bottomOverlay).toBe("true");
      expect(metrics.panelBottom).toBeLessThanOrEqual(metrics.overlayTop - 8);
    } finally {
      await stopHarness(harness);
    }
  });
});
