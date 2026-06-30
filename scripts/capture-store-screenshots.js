const { mkdirSync, rmSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { closeExtension, launchExtension } = require("../tests/e2e/helpers/extension");
const { startFixtureServer, stopFixtureServer } = require("../tests/e2e/helpers/fixture-server");
const { registerTranslateStub } = require("../tests/e2e/helpers/translate-stub");

const ROOT = join(__dirname, "..");
const SCREENSHOT_ROUTES = new Map([
  [
    "/logged-in-courses",
    {
      selector: "#courses-title",
      translated: "OpenAI Academy 강좌",
      restored: "OpenAI Academy Courses"
    }
  ],
  [
    "/course",
    {
      selector: "#title",
      translated: "업무를 위한 실용 AI 기술 구축",
      restored: "Build practical AI skills for work"
    }
  ],
  [
    "/study-room",
    {
      selector: "#study-title",
      translated: "업무를 위한 실용 AI 기술 구축",
      restored: "Build practical AI skills for work"
    }
  ],
  [
    "/live-lesson-shell",
    {
      selector: "#live-title",
      translated: "업무를 위한 실용 AI 기술 구축",
      restored: "Build practical AI skills for work"
    }
  ]
]);

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return process.argv[index + 1];
}

async function waitForPanel(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector(".academylens-root");
    return Boolean(root && root.shadowRoot && root.shadowRoot.querySelector("[data-translate]"));
  });
}

async function panelClick(page, selector) {
  await page.evaluate((innerSelector) => {
    document.querySelector(".academylens-root").shadowRoot.querySelector(innerSelector).click();
  }, selector);
}

async function expandPanel(page) {
  const collapsed = await page.evaluate(() => {
    const panel = document.querySelector(".academylens-root").shadowRoot.querySelector(".panel");
    return panel.dataset.collapsed === "true";
  });
  if (collapsed) await panelClick(page, "[data-collapse]");
}

async function screenshot(page, outDir, filename) {
  const path = join(outDir, filename);
  await page.screenshot({ path, fullPage: false });
  console.log(`saved ${path}`);
}

function routeConfig(path) {
  const config = SCREENSHOT_ROUTES.get(path);
  if (config) return config;
  throw new Error(
    `Unsupported screenshot path: ${path}. Supported paths: ${Array.from(SCREENSHOT_ROUTES.keys()).join(", ")}`
  );
}

async function waitForText(page, selector, text) {
  await page.waitForFunction(
    ({ innerSelector, expectedText }) => document.querySelector(innerSelector)?.textContent === expectedText,
    { innerSelector: selector, expectedText: text }
  );
}

async function main() {
  const outDir = resolve(argValue("--out", join(ROOT, "dist/store-screenshots")));
  const path = argValue("--path", "/logged-in-courses");
  const expectation = routeConfig(path);
  let fixture;
  let ext;

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  try {
    fixture = await startFixtureServer();
    ext = await launchExtension();
    await registerTranslateStub(ext.context);

    const page = await ext.context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fixture.baseUrl}${path}`, { waitUntil: "domcontentloaded" });
    await waitForPanel(page);
    await expandPanel(page);
    await page.waitForTimeout(350);
    await screenshot(page, outDir, "01-desktop-panel-ready.png");

    await panelClick(page, "[data-translate]");
    await waitForText(page, expectation.selector, expectation.translated);
    await page.waitForTimeout(350);
    await screenshot(page, outDir, "02-desktop-translated.png");

    await panelClick(page, "[data-restore]");
    await waitForText(page, expectation.selector, expectation.restored);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(350);
    await screenshot(page, outDir, "03-mobile-panel-ready.png");
  } finally {
    if (ext) await closeExtension(ext);
    if (fixture) await stopFixtureServer(fixture.server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
