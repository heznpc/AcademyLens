const { mkdirSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const { dirname, join, resolve } = require("node:path");
const { chromium } = require("@playwright/test");

const ROOT = join(__dirname, "..");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

async function main() {
  const url = argValue("--url", "https://academy.openai.com/pages/courses");
  const out = resolve(argValue("--out", join(os.tmpdir(), "academylens-captured-page.html")));
  const profile = resolve(
    argValue("--profile", process.env.ACADEMYLENS_CAPTURE_PROFILE || join(os.tmpdir(), "academylens-capture-profile"))
  );
  const channel = argValue("--channel", process.env.E2E_BROWSER_CHANNEL || "chromium");
  const timeout = Number(argValue("--timeout", "45000"));
  const fixtureDir = resolve(join(ROOT, "tests/fixtures"));

  if (out.startsWith(fixtureDir) && !hasFlag("--allow-fixture-write")) {
    throw new Error(
      "Refusing to write captured logged-in DOM under tests/fixtures without --allow-fixture-write. " +
        "Use /tmp first, review the file, then rerun with the flag if it is safe to commit."
    );
  }

  const context = await chromium.launchPersistentContext(profile, {
    channel,
    headless: !hasFlag("--headed"),
    locale: "ko-KR",
    args: ["--no-first-run", "--no-default-browser-check", "--lang=ko-KR"]
  });

  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    await page.waitForLoadState("networkidle", { timeout }).catch(() => {});
    await page.waitForTimeout(1500);

    const snapshot = await page.evaluate(() => {
      const clone = document.documentElement.cloneNode(true);
      for (const selector of ["script", "style", "noscript", "svg", "canvas", "iframe"]) {
        for (const node of clone.querySelectorAll(selector)) node.remove();
      }
      for (const node of clone.querySelectorAll("*")) {
        for (const attribute of Array.from(node.attributes)) {
          const name = attribute.name.toLowerCase();
          if (["href", "src", "srcset", "action", "poster", "integrity", "nonce"].includes(name)) {
            node.setAttribute(attribute.name, "");
          } else if (/token|secret|session|auth|email|name|avatar|picture/i.test(name)) {
            node.setAttribute(attribute.name, "[redacted]");
          } else if (attribute.value) {
            node.setAttribute(
              attribute.name,
              attribute.value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
            );
          }
        }
      }
      for (const input of clone.querySelectorAll("input, textarea")) {
        input.setAttribute("value", "");
        input.textContent = "";
      }
      const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        current.textContent = current.textContent.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
        current = walker.nextNode();
      }

      return {
        title: document.title,
        url: `${location.origin}${location.pathname}`,
        signedInHint: !/\bSIGN IN\b/i.test(document.body ? document.body.innerText : ""),
        html: `<!doctype html>\n${clone.outerHTML}`
      };
    });

    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, snapshot.html);
    console.log(`saved ${out}`);
    console.log(`title: ${snapshot.title}`);
    console.log(`url: ${snapshot.url}`);
    console.log(`signedInHint: ${snapshot.signedInHint}`);
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
