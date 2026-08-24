const { mkdirSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const { dirname, join, resolve } = require("node:path");
const { chromium } = require("@playwright/test");

const Contract = require("../src/lib/academy-dom-contract.js");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}

async function main() {
  const url = argValue("--url", Contract.PUBLIC_COURSES_URL);
  const output = resolve(argValue("--out", join(os.tmpdir(), "academylens-dom-drift.json")));
  const timeout = Number(argValue("--timeout", "45000"));
  const browser = await chromium.launch({ headless: true });
  let report;
  try {
    const page = await browser.newPage({ locale: "en-US" });
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    await page.waitForLoadState("networkidle", { timeout: Math.min(timeout, 15000) }).catch(() => {});
    await page.waitForTimeout(1000);
    report = await page.evaluate(
      ({ surfaces, checkedUrl }) => {
        const counts = Object.fromEntries(
          Object.entries(surfaces).map(([name, selectors]) => [
            name,
            selectors.reduce((total, selector) => total + document.querySelectorAll(selector).length, 0)
          ])
        );
        const bodyTextLength = String(document.body ? document.body.innerText || "" : "").trim().length;
        const failures = [];
        if (counts.document < 2) failures.push("document-surface-missing");
        if (counts.primary < 1) failures.push("primary-surface-missing");
        if (bodyTextLength < 100) failures.push("public-page-content-too-small");
        if (counts.courseLinks < 1) failures.push("course-links-missing");
        return {
          ok: failures.length === 0,
          checkedAt: new Date().toISOString(),
          requestedUrl: checkedUrl,
          finalUrl: location.href,
          title: document.title,
          httpStatus: null,
          counts,
          bodyTextLength,
          failures,
          signature: Object.entries(counts)
            .map(([name, count]) => `${name}:${count}`)
            .join("|")
        };
      },
      { surfaces: Contract.SURFACES, checkedUrl: url }
    );
    report.httpStatus = response ? response.status() : null;
    if (!response || !response.ok()) {
      report.ok = false;
      report.failures.unshift(`http-status-${report.httpStatus || "none"}`);
    }
  } finally {
    await browser.close();
  }

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  const output = resolve(argValue("--out", join(os.tmpdir(), "academylens-dom-drift.json")));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        failures: ["checker-error"],
        error: error.message || String(error)
      },
      null,
      2
    )}\n`
  );
  console.error(error);
  process.exitCode = 1;
});
