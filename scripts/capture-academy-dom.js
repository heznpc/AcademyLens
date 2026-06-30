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
      const PII_TEXT_REDACTIONS = [
        { label: "email", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, replacement: "[email]" },
        {
          label: "phone",
          pattern: /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4}\b/g,
          replacement: "[phone]"
        },
        {
          label: "uuid",
          pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
          replacement: "[id]"
        },
        {
          label: "long-id",
          pattern: /\b(?=[A-Za-z0-9_-]{20,}\b)(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{20,}\b/g,
          replacement: "[id]"
        }
      ];
      const SENSITIVE_CONTAINER_SELECTORS = [
        "[aria-label*='account' i]",
        "[aria-label*='avatar' i]",
        "[aria-label*='member' i]",
        "[aria-label*='notification' i]",
        "[aria-label*='participant' i]",
        "[aria-label*='profile' i]",
        "[aria-label*='user' i]",
        "[data-testid*='account' i]",
        "[data-testid*='avatar' i]",
        "[data-testid*='member' i]",
        "[data-testid*='notification' i]",
        "[data-testid*='participant' i]",
        "[data-testid*='profile' i]",
        "[data-testid*='user' i]",
        "[class*='account' i]",
        "[class*='avatar' i]",
        "[class*='member' i]",
        "[class*='notification' i]",
        "[class*='participant' i]",
        "[class*='profile' i]",
        "[class*='user' i]"
      ];
      const report = {
        removedElements: 0,
        redactedContainers: 0,
        redactedAttributes: 0,
        redactedFormFields: 0,
        textRedactions: Object.fromEntries(PII_TEXT_REDACTIONS.map((entry) => [entry.label, 0])),
        residualRiskMatches: 0
      };

      function redactText(value) {
        let next = value;
        for (const redaction of PII_TEXT_REDACTIONS) {
          next = next.replace(redaction.pattern, () => {
            report.textRedactions[redaction.label] += 1;
            return redaction.replacement;
          });
        }
        return next;
      }

      function hasResidualRisk(value) {
        return PII_TEXT_REDACTIONS.some((redaction) => {
          redaction.pattern.lastIndex = 0;
          return redaction.pattern.test(value);
        });
      }

      const clone = document.documentElement.cloneNode(true);
      for (const selector of ["script", "style", "noscript", "svg", "canvas", "iframe", "picture", "source", "img"]) {
        for (const node of clone.querySelectorAll(selector)) {
          report.removedElements += 1;
          node.remove();
        }
      }
      for (const node of clone.querySelectorAll(".academylens-root, [data-academylens-root]")) {
        report.removedElements += 1;
        node.remove();
      }
      for (const selector of SENSITIVE_CONTAINER_SELECTORS) {
        for (const node of clone.querySelectorAll(selector)) {
          node.textContent = "[redacted account]";
          for (const attribute of Array.from(node.attributes)) {
            if (attribute.value && attribute.value !== "[redacted]") {
              node.setAttribute(attribute.name, "[redacted]");
              report.redactedAttributes += 1;
            }
          }
          report.redactedContainers += 1;
        }
      }
      for (const node of clone.querySelectorAll("*")) {
        for (const attribute of Array.from(node.attributes)) {
          const name = attribute.name.toLowerCase();
          if (["href", "src", "srcset", "action", "poster", "integrity", "nonce"].includes(name)) {
            node.setAttribute(attribute.name, "");
            report.redactedAttributes += 1;
          } else if (name === "alt") {
            node.setAttribute(attribute.name, "[redacted image]");
            report.redactedAttributes += 1;
          } else if (/token|secret|session|auth|email|name|avatar|picture/i.test(name)) {
            node.setAttribute(attribute.name, "[redacted]");
            report.redactedAttributes += 1;
          } else if (attribute.value) {
            const nextValue = redactText(attribute.value);
            if (nextValue !== attribute.value) report.redactedAttributes += 1;
            node.setAttribute(attribute.name, nextValue);
          }
        }
      }
      for (const input of clone.querySelectorAll("input, textarea")) {
        input.setAttribute("value", "");
        input.textContent = "";
        report.redactedFormFields += 1;
      }
      const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        current.textContent = redactText(current.textContent);
        if (hasResidualRisk(current.textContent)) report.residualRiskMatches += 1;
        current = walker.nextNode();
      }

      return {
        title: document.title,
        url: `${location.origin}${location.pathname}`,
        signedInHint: !/\bSIGN IN\b/i.test(document.body ? document.body.innerText : ""),
        html: `<!doctype html>\n${clone.outerHTML}`,
        report
      };
    });

    if (out.startsWith(fixtureDir) && snapshot.report.residualRiskMatches > 0) {
      throw new Error("Refusing fixture write because residual sensitive patterns remain after redaction.");
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, snapshot.html);
    console.log(`saved ${out}`);
    console.log(`title: ${snapshot.title}`);
    console.log(`url: ${snapshot.url}`);
    console.log(`signedInHint: ${snapshot.signedInHint}`);
    console.log(`redactionReport: ${JSON.stringify(snapshot.report)}`);
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
