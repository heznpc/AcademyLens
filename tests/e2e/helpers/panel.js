const { expect } = require("@playwright/test");

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

async function setAutoTranslate(page, enabled) {
  await page.evaluate((value) => {
    const checkbox = document.querySelector(".academylens-root").shadowRoot.querySelector("[data-auto-translate]");
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
      correctionCount: shadow ? shadow.querySelector("[data-correction-count]").textContent : null,
      diagnostics: shadow ? shadow.querySelector("[data-diagnostics-output]").textContent : null,
      status: shadow ? shadow.querySelector("[data-status]").textContent : null,
      statusRole: shadow ? shadow.querySelector("[data-status]").getAttribute("role") : null,
      statusLive: shadow ? shadow.querySelector("[data-status]").getAttribute("aria-live") : null,
      statusAtomic: shadow ? shadow.querySelector("[data-status]").getAttribute("aria-atomic") : null
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

async function waitForTranslationFinished(page) {
  await expect
    .poll(async () => (await panelSnapshot(page)).status)
    .toMatch(/텍스트 \d+개를 번역했습니다\.|Translated \d+ text blocks\./);
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

module.exports = {
  clickPanelButton,
  expandPanel,
  panelProgress,
  panelSnapshot,
  savePanelCorrection,
  setAutoTranslate,
  setNativeDownloads,
  setPanelLanguage,
  waitForPanel,
  waitForTranslationFinished
};
