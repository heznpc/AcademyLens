const { createHash, randomUUID } = require("node:crypto");
const { existsSync, realpathSync } = require("node:fs");
const os = require("node:os");
const { basename, dirname, isAbsolute, join, relative, resolve, sep } = require("node:path");
const { chromium } = require("@playwright/test");

const AcademyDomContract = require("../src/lib/academy-dom-contract.js");
const Constants = require("../src/lib/constants.js");
const TranslationQuality = require("../src/lib/translation-quality.js");

const ROOT = join(__dirname, "..");
const SENTINEL_ID = "academylens-live-qa-sentinel";
const SENTINEL_BASE = "Build reliable agents with clear instructions and human oversight.";
const CANDIDATE_ATTRIBUTE = "data-academylens-live-qa-candidate";
const VALUE_OPTIONS = new Set(["--url", "--target", "--engine", "--profile", "--channel", "--timeout"]);
const FLAG_OPTIONS = new Set(["--headless", "--allow-native-downloads"]);
const BLOCKED_ACADEMY_PATH =
  /(?:^|\/)(?:auth|error|forbidden|login|log[-_]?in|not[-_]?found|signin|sign[-_]?in|unauthorized|404)(?:\/|$)/i;
const BLOCKED_ACADEMY_ROUTE_SIGNAL =
  /(?:^|[\s/?#&=_-])(?:auth|error|forbidden|login|log[-_]?in|not[-_]?found|signin|sign[-_]?in|unauthorized|404)(?=$|[\s/?#&=_-])/i;
const BLOCKED_ACADEMY_TITLE =
  /\b(?:access denied|error|forbidden|not found|sign in|log in|something went wrong|unauthorized)\b/i;

function parseArgumentMap(argv) {
  const values = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (FLAG_OPTIONS.has(argument)) {
      if (flags.has(argument)) throw new Error(`Duplicate live QA argument: ${argument}`);
      flags.add(argument);
      continue;
    }
    if (!VALUE_OPTIONS.has(argument)) throw new Error(`Unknown live QA argument: ${argument}`);
    if (values.has(argument)) throw new Error(`Duplicate live QA argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for live QA argument: ${argument}`);
    values.set(argument, value);
    index += 1;
  }
  return { values, flags };
}

function canonicalPath(value) {
  let existingAncestor = resolve(value);
  const missingSegments = [];
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) return resolve(value);
    missingSegments.unshift(basename(existingAncestor));
    existingAncestor = parent;
  }
  let canonicalAncestor;
  try {
    canonicalAncestor = realpathSync.native(existingAncestor);
  } catch {
    canonicalAncestor = existingAncestor;
  }
  return resolve(canonicalAncestor, ...missingSegments);
}

function pathIsWithin(parent, candidate) {
  const relationship = relative(canonicalPath(parent), canonicalPath(candidate));
  return (
    relationship === "" || (!relationship.startsWith(`..${sep}`) && relationship !== ".." && !isAbsolute(relationship))
  );
}

function normalizedPathname(value) {
  const pathname = new URL(value).pathname.replace(/\/+$/, "");
  return pathname || "/";
}

function academyRouteHasBlockedSignal(parsed) {
  if (BLOCKED_ACADEMY_PATH.test(parsed.pathname)) return true;
  let decodedHash = parsed.hash || "";
  try {
    decodedHash = decodeURIComponent(decodedHash);
  } catch {
    return true;
  }
  if (BLOCKED_ACADEMY_ROUTE_SIGNAL.test(decodedHash)) return true;
  for (const [key, value] of parsed.searchParams) {
    if (BLOCKED_ACADEMY_ROUTE_SIGNAL.test(key) || BLOCKED_ACADEMY_ROUTE_SIGNAL.test(value)) return true;
  }
  return false;
}

function validateAcademyUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "academy.openai.com" ||
    parsed.port ||
    !Constants.isAcademyUrl(parsed.href)
  ) {
    throw new Error(`${label} must be an https://academy.openai.com Academy URL`);
  }
  if (academyRouteHasBlockedSignal(parsed)) {
    throw new Error(`${label} cannot target an authentication or error route`);
  }
  return parsed;
}

function parseOptions(argv = process.argv.slice(2), environment = process.env) {
  const { values, flags } = parseArgumentMap(argv);
  const requestedUrl = validateAcademyUrl(values.get("--url") || AcademyDomContract.PUBLIC_COURSES_URL, "Live QA URL");
  const rawTarget = values.get("--target") || "ko";
  const targetLanguage = Constants.matchSupportedLanguage(rawTarget);
  const rawEngine = values.get("--engine") || Constants.TRANSLATION_ENGINES.DEVICE;
  const timeout = Number(values.get("--timeout") || "120000");
  const profile = resolve(
    values.get("--profile") || environment.ACADEMYLENS_QA_PROFILE || join(os.tmpdir(), "academylens-live-qa-profile")
  );
  const channel = values.get("--channel") || environment.E2E_BROWSER_CHANNEL || "chrome";
  const allowNativeDownloads = flags.has("--allow-native-downloads");

  if (!targetLanguage || targetLanguage === "en") {
    throw new Error(`Live QA requires a supported non-English target, received: ${rawTarget}`);
  }
  if (!Constants.TRANSLATION_ENGINE_VALUES.includes(rawEngine)) {
    throw new Error(`Unknown live QA translation engine: ${rawEngine}`);
  }
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("Live QA timeout must be a positive number");
  if (pathIsWithin(ROOT, profile)) throw new Error("Live QA browser profile must remain outside the repository");
  if (allowNativeDownloads && rawEngine !== Constants.TRANSLATION_ENGINES.DEVICE) {
    throw new Error("--allow-native-downloads can only be used with --engine device");
  }

  return Object.freeze({
    url: requestedUrl.href,
    targetLanguage,
    engine: rawEngine,
    profile,
    channel,
    timeout,
    headless: flags.has("--headless"),
    allowNativeDownloads
  });
}

function validateFinalAcademyUrl(requestedUrl, finalUrl) {
  const requested = validateAcademyUrl(requestedUrl, "Requested live QA URL");
  const final = validateAcademyUrl(finalUrl, "Final live QA URL");
  if (
    normalizedPathname(requested.href) !== normalizedPathname(final.href) ||
    requested.search !== final.search ||
    requested.hash !== final.hash
  ) {
    throw new Error(`Academy QA redirected to an unexpected route: ${final.pathname}${final.search}${final.hash}`);
  }
  return final;
}

function validateAcademyRedirectChain(requestedUrl, response) {
  let request = response && typeof response.request === "function" ? response.request() : null;
  while (request) {
    validateFinalAcademyUrl(requestedUrl, request.url());
    request = typeof request.redirectedFrom === "function" ? request.redirectedFrom() : null;
  }
}

function createPageRouteGuard(page, requestedUrl) {
  let firstFailure = null;
  const inspect = (frame) => {
    if (frame !== page.mainFrame()) return;
    try {
      validateFinalAcademyUrl(requestedUrl, frame.url());
    } catch (error) {
      if (!firstFailure) firstFailure = error;
    }
  };
  page.on("framenavigated", inspect);
  return Object.freeze({
    assert() {
      if (firstFailure) throw firstFailure;
      return validateFinalAcademyUrl(requestedUrl, page.url());
    },
    stop() {
      page.off("framenavigated", inspect);
    }
  });
}

function assessAcademySurface(snapshot) {
  const counts = (snapshot && snapshot.counts) || {};
  const failures = [];
  if (Number(counts.document || 0) < 2) failures.push("document-surface-missing");
  if (Number(counts.primary || 0) < 1) failures.push("primary-surface-missing");
  if (Number(counts.courseLinks || 0) < 1) failures.push("course-links-missing");
  if (Number(counts.primaryCourseSurface || 0) < 1) failures.push("visible-primary-course-surface-missing");
  if (Number((snapshot && snapshot.bodyTextLength) || 0) < 100) failures.push("public-page-content-too-small");
  if (BLOCKED_ACADEMY_TITLE.test(String(snapshot && snapshot.title))) failures.push("authentication-or-error-title");
  if (snapshot?.authenticationOrErrorSurface) failures.push("authentication-or-error-surface");
  return Object.freeze({ ok: failures.length === 0, failures, counts });
}

function createSentinelSource(runId = randomUUID()) {
  const value = String(runId);
  if (!value) throw new Error("Live QA run id must not be empty");
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 14);
  const verificationNumber = BigInt(`0x${digest}`).toString(10);
  return `${SENTINEL_BASE} Verification number ${verificationNumber}.`;
}

async function extensionServiceWorker(context, timeout) {
  let worker = context.serviceWorkers().find((candidate) => candidate.url().startsWith("chrome-extension://"));
  if (!worker) {
    worker = await context.waitForEvent("serviceworker", {
      predicate: (candidate) => candidate.url().startsWith("chrome-extension://"),
      timeout
    });
  }
  return worker;
}

async function configurePopup(context, extensionId, options) {
  const popup = await context.newPage();
  try {
    await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`, {
      waitUntil: "domcontentloaded",
      timeout: options.timeout
    });
    await popup.locator("#targetLanguage").selectOption(options.targetLanguage);
    await popup.locator("#autoTranslate").uncheck();
    if (options.allowNativeDownloads) {
      await popup.locator("#nativeDownloads").check();
    } else {
      await popup.locator("#nativeDownloads").uncheck();
    }
    if (options.engine !== Constants.TRANSLATION_ENGINES.DEVICE) {
      console.log("Approve the Chrome optional-host permission prompt in the opened QA window if it appears.");
    }
    await popup.locator("#translationEngine").selectOption(options.engine);
    await popup.waitForFunction(
      async ({ allowNativeDownloads, engine, settingsKey, targetLanguage }) => {
        const stored = await chrome.storage.local.get([settingsKey]);
        const settings = stored[settingsKey] || {};
        return (
          settings.targetLanguage === targetLanguage &&
          settings.translationEngine === engine &&
          settings.autoTranslate === false &&
          settings.enableBrowserTranslatorDownloads === allowNativeDownloads
        );
      },
      {
        allowNativeDownloads: options.allowNativeDownloads,
        engine: options.engine,
        settingsKey: Constants.STORAGE_KEYS.SETTINGS,
        targetLanguage: options.targetLanguage
      },
      { timeout: options.timeout }
    );

    if (
      options.engine === Constants.TRANSLATION_ENGINES.REMOTE ||
      options.engine === Constants.TRANSLATION_ENGINES.OLLAMA
    ) {
      const origin =
        options.engine === Constants.TRANSLATION_ENGINES.REMOTE
          ? Constants.REMOTE_TRANSLATION_ORIGIN
          : Constants.OLLAMA_ORIGIN;
      const granted = await popup.evaluate((permissionOrigin) => {
        return chrome.permissions.contains({ origins: [permissionOrigin] });
      }, origin);
      if (!granted) throw new Error(`Required optional host permission was not granted for ${origin}`);
    }
  } finally {
    await popup.close();
  }
}

async function inspectAcademySurface(page, timeout) {
  await page.waitForLoadState("networkidle", { timeout: Math.min(timeout, 15000) }).catch(() => {});
  await page
    .waitForFunction(
      (surfaces) => {
        const elements = (selectors) => [
          ...new Set(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))))
        ];
        const visible = (element) => {
          let current = element;
          while (current) {
            const style = window.getComputedStyle(current);
            if (
              current.hidden ||
              current.getAttribute("aria-hidden") === "true" ||
              current.hasAttribute("inert") ||
              style.display === "none" ||
              style.visibility === "hidden" ||
              style.visibility === "collapse" ||
              style.opacity === "0" ||
              style.contentVisibility === "hidden"
            ) {
              return false;
            }
            current = current.parentElement;
          }
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        return elements(surfaces.primary).some(
          (primary) =>
            visible(primary) && elements(surfaces.courseLinks).some((link) => primary.contains(link) && visible(link))
        );
      },
      AcademyDomContract.SURFACES,
      { timeout }
    )
    .catch(() => {});

  const snapshot = await page.evaluate((surfaces) => {
    const elements = (selectors) => [
      ...new Set(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))))
    ];
    const visible = (element) => {
      let current = element;
      while (current) {
        const style = window.getComputedStyle(current);
        if (
          current.hidden ||
          current.getAttribute("aria-hidden") === "true" ||
          current.hasAttribute("inert") ||
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.visibility === "collapse" ||
          style.opacity === "0" ||
          style.contentVisibility === "hidden"
        ) {
          return false;
        }
        current = current.parentElement;
      }
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const counts = Object.fromEntries(
      Object.entries(surfaces).map(([name, selectors]) => [
        name,
        selectors.reduce((total, selector) => total + document.querySelectorAll(selector).length, 0)
      ])
    );
    const primarySurfaces = elements(surfaces.primary).filter(visible);
    const courseLinks = elements(surfaces.courseLinks).filter(visible);
    counts.primaryCourseSurface = primarySurfaces.filter((primary) =>
      courseLinks.some((link) => primary.contains(link))
    ).length;
    const authHeadingPattern =
      /^(?:access denied|error(?:\s+\d{3})?|forbidden|log in|not found|sign in|something went wrong|unauthorized)[.!]?$/i;
    const authenticationOrErrorSurface = primarySurfaces.some((primary) => {
      const hasPassword = Array.from(primary.querySelectorAll("input[type='password']")).some(visible);
      const hasAuthForm = Array.from(primary.querySelectorAll("form[action]")).some(
        (form) =>
          visible(form) && /(?:auth|login|log[-_]?in|signin|sign[-_]?in)/i.test(form.getAttribute("action") || "")
      );
      const hasBlockedHeading = Array.from(primary.querySelectorAll("h1, h2, [role='heading']")).some(
        (heading) => visible(heading) && authHeadingPattern.test(String(heading.textContent || "").trim())
      );
      return hasPassword || hasAuthForm || hasBlockedHeading;
    });
    return {
      counts,
      bodyTextLength: String(document.body ? document.body.innerText || "" : "").trim().length,
      title: document.title,
      authenticationOrErrorSurface
    };
  }, AcademyDomContract.SURFACES);
  const report = assessAcademySurface(snapshot);
  if (!report.ok) throw new Error(`Academy DOM contract failed: ${report.failures.join(",")}`);
  return report;
}

async function prepareProbe(page, sentinelSource, marker) {
  return page.evaluate(
    ({
      candidateAttribute,
      courseLinkSelectors,
      excludedSelector,
      marker,
      primarySelectors,
      sentinelId,
      sentinelSource
    }) => {
      document.getElementById(sentinelId)?.remove();
      for (const node of document.querySelectorAll(`[${candidateAttribute}]`)) node.removeAttribute(candidateAttribute);

      const selectElements = (selectors, root = document) => [
        ...new Set(selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector))))
      ];
      const visible = (element) => {
        let current = element;
        while (current) {
          const style = window.getComputedStyle(current);
          if (
            current.hidden ||
            current.getAttribute("aria-hidden") === "true" ||
            current.hasAttribute("inert") ||
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.visibility === "collapse" ||
            style.opacity === "0" ||
            style.contentVisibility === "hidden"
          ) {
            return false;
          }
          current = current.parentElement;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const visibleCourseLinks = selectElements(courseLinkSelectors).filter(visible);
      const primary = selectElements(primarySelectors).find(
        (candidate) => visible(candidate) && visibleCourseLinks.some((link) => candidate.contains(link))
      );
      if (!primary) throw new Error("Academy primary course surface disappeared before the translation probe");
      const candidateElements = Array.from(primary.querySelectorAll("h1, h2, h3, p"));
      const candidates = candidateElements
        .filter((element) => {
          if (element.closest(excludedSelector) || element.querySelector(excludedSelector)) return false;
          const text = String(element.textContent || "")
            .replace(/\s+/g, " ")
            .trim();
          if (text.length < 20 || text.length > 600 || !/[A-Za-z]{4}/.test(text)) return false;
          if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) return false;
          return visible(element);
        })
        .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)
        .slice(0, 5)
        .map((element, index) => {
          const id = `${marker}-${index}`;
          element.setAttribute(candidateAttribute, id);
          return { id, original: element.textContent };
        });
      if (!candidates.length)
        throw new Error("No existing Academy text candidate was available for live translation QA");

      const sentinel = document.createElement("p");
      sentinel.id = sentinelId;
      sentinel.textContent = sentinelSource;
      sentinel.style.cssText = "display:block;visibility:visible;position:relative";
      primary.prepend(sentinel);
      return { sentinelSource, candidates };
    },
    {
      candidateAttribute: CANDIDATE_ATTRIBUTE,
      courseLinkSelectors: AcademyDomContract.SURFACES.courseLinks,
      excludedSelector: Constants.EXCLUDED_SELECTOR,
      marker,
      primarySelectors: AcademyDomContract.SURFACES.primary,
      sentinelId: SENTINEL_ID,
      sentinelSource
    }
  );
}

async function probeState(page, probe) {
  return page.evaluate(
    ({ candidateAttribute, candidates, sentinelId }) => {
      const root = document.querySelector(".academylens-root");
      const shadow = root && root.shadowRoot;
      const panel = shadow && shadow.querySelector(".panel");
      const status = shadow && shadow.querySelector("[data-status]");
      const sentinel = document.getElementById(sentinelId);
      const actual = candidates.map((candidate) => {
        const element = Array.from(document.querySelectorAll(`[${candidateAttribute}]`)).find(
          (node) => node.getAttribute(candidateAttribute) === candidate.id
        );
        return { id: candidate.id, text: element ? element.textContent : "", exists: Boolean(element) };
      });
      return {
        busy: panel ? panel.dataset.busy : "missing",
        status: status ? status.textContent : "",
        tone: status ? status.dataset.tone : "",
        sentinelExists: Boolean(sentinel),
        sentinelText: sentinel ? sentinel.textContent : "",
        actual
      };
    },
    { candidateAttribute: CANDIDATE_ATTRIBUTE, candidates: probe.candidates, sentinelId: SENTINEL_ID }
  );
}

function normalizedText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function assessTranslatedProbe(probe, state, targetLanguage) {
  const snapshot = state || {};
  const actual = Array.isArray(snapshot.actual) ? snapshot.actual : [];
  const evaluatedCandidates = probe.candidates.map((candidate) => ({
    original: candidate,
    current: actual.find((item) => item.id === candidate.id) || null
  }));
  const sentinelChanged =
    snapshot.sentinelExists === true &&
    Boolean(normalizedText(snapshot.sentinelText)) &&
    normalizedText(snapshot.sentinelText) !== normalizedText(probe.sentinelSource);
  const sentinelQuality = sentinelChanged
    ? TranslationQuality.validate(probe.sentinelSource, snapshot.sentinelText, targetLanguage)
    : { ok: false, issue: snapshot.sentinelExists === true ? "unchanged" : "missing" };
  const actualCandidatesChanged = evaluatedCandidates.filter(({ current, original }) => {
    return current?.exists && normalizedText(current.text) !== normalizedText(original.original);
  }).length;
  const translatedCandidate = evaluatedCandidates.find(({ current, original }) => {
    return (
      current?.exists &&
      normalizedText(current.text) !== normalizedText(original.original) &&
      TranslationQuality.validate(original.original, current.text, targetLanguage).ok
    );
  });
  const actualCandidate = translatedCandidate ? translatedCandidate.current : null;
  const failures = [];
  if (!sentinelChanged) failures.push("sentinel-not-translated");
  else if (!sentinelQuality.ok) failures.push(`sentinel-quality:${sentinelQuality.issue}`);
  if (!actualCandidate) failures.push("academy-candidate-not-translated");
  return Object.freeze({
    ok: failures.length === 0,
    failures,
    sentinelChanged,
    sentinelQuality,
    actualCandidatesChanged,
    actualCandidate: actualCandidate || null
  });
}

function assessRestoredProbe(probe, state) {
  const snapshot = state || {};
  const actual = Array.isArray(snapshot.actual) ? snapshot.actual : [];
  const sentinelRestored =
    snapshot.sentinelExists === true && String(snapshot.sentinelText || "") === String(probe.sentinelSource || "");
  const candidatesRestored = probe.candidates.filter((candidate) => {
    const restored = actual.find((item) => item.id === candidate.id);
    return restored && restored.exists && String(restored.text || "") === String(candidate.original || "");
  }).length;
  const failures = [];
  if (!sentinelRestored) failures.push("sentinel-not-restored");
  if (candidatesRestored !== probe.candidates.length) failures.push("academy-candidates-not-restored");
  return Object.freeze({
    ok: failures.length === 0,
    failures,
    sentinelRestored,
    candidatesRestored,
    candidateCount: probe.candidates.length
  });
}

async function waitForTranslatedProbe(page, probe, targetLanguage, timeout) {
  const deadline = Date.now() + timeout;
  let latest;
  let latestAssessment = null;
  while (Date.now() < deadline) {
    latest = await probeState(page, probe);
    latestAssessment = assessTranslatedProbe(probe, latest, targetLanguage);
    if (latestAssessment.ok) return { state: latest, actualCandidate: latestAssessment.actualCandidate };
    if (latest.busy === "false" && latest.tone === "error") {
      const proofFailures = latestAssessment.failures.join(",") || "unknown-proof-failure";
      throw new Error(`Live translation failed: ${latest.status || "unknown panel error"} (proof=${proofFailures})`);
    }
    await page.waitForTimeout(250);
  }
  throw new Error(
    `Timed out waiting for live translation proof (sentinelChanged=${Boolean(
      latestAssessment && latestAssessment.sentinelChanged
    )}, actualCandidatesChanged=${latestAssessment ? latestAssessment.actualCandidatesChanged : 0})`
  );
}

async function restoreProbe(page, probe, timeout) {
  await page.evaluate(() => {
    document.querySelector(".academylens-root").shadowRoot.querySelector("[data-restore]").click();
  });
  const deadline = Date.now() + timeout;
  let latestAssessment = null;
  while (Date.now() < deadline) {
    latestAssessment = assessRestoredProbe(probe, await probeState(page, probe));
    if (latestAssessment.ok) return latestAssessment;
    await page.waitForTimeout(250);
  }
  throw new Error(
    `Timed out waiting for live restore proof (sentinelRestored=${Boolean(
      latestAssessment && latestAssessment.sentinelRestored
    )}, academyCandidatesRestored=${latestAssessment ? latestAssessment.candidatesRestored : 0}/${probe.candidates.length})`
  );
}

async function cleanupProbe(page) {
  await page
    .evaluate(
      ({ candidateAttribute, sentinelId }) => {
        document.getElementById(sentinelId)?.remove();
        for (const node of document.querySelectorAll(`[${candidateAttribute}]`))
          node.removeAttribute(candidateAttribute);
      },
      { candidateAttribute: CANDIDATE_ATTRIBUTE, sentinelId: SENTINEL_ID }
    )
    .catch(() => {});
}

async function main(argv = process.argv.slice(2), environment = process.env) {
  const options = parseOptions(argv, environment);
  const sentinelSource = createSentinelSource();
  const marker = randomUUID();
  const context = await chromium.launchPersistentContext(options.profile, {
    channel: options.channel,
    headless: options.headless,
    locale: "ko-KR",
    args: [
      `--disable-extensions-except=${ROOT}`,
      `--load-extension=${ROOT}`,
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      "--enable-unsafe-extension-debugging",
      "--no-first-run",
      "--no-default-browser-check",
      "--lang=ko-KR"
    ]
  });

  let page;
  let probe;
  let routeGuard;
  try {
    const worker = await extensionServiceWorker(context, options.timeout);
    const extensionId = worker.url().split("/")[2];
    await configurePopup(context, extensionId, options);

    page = await context.newPage();
    routeGuard = createPageRouteGuard(page, options.url);
    const response = await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeout });
    if (!response || !response.ok()) throw new Error(`Academy returned HTTP ${response ? response.status() : "none"}`);
    validateAcademyRedirectChain(options.url, response);
    const finalUrl = routeGuard.assert();
    const surface = await inspectAcademySurface(page, options.timeout);
    routeGuard.assert();
    await page.waitForFunction(
      () => Boolean(document.querySelector(".academylens-root")?.shadowRoot?.querySelector("[data-translate]")),
      null,
      { timeout: options.timeout }
    );
    routeGuard.assert();

    probe = await prepareProbe(page, sentinelSource, marker);
    await page.evaluate(() => {
      const shadow = document.querySelector(".academylens-root").shadowRoot;
      const panel = shadow.querySelector(".panel");
      if (panel.dataset.collapsed === "true") shadow.querySelector("[data-collapse]").click();
      shadow.querySelector("[data-translate]").click();
    });

    const translated = await waitForTranslatedProbe(page, probe, options.targetLanguage, options.timeout);
    routeGuard.assert();
    await restoreProbe(page, probe, options.timeout);
    routeGuard.assert();

    console.log(
      JSON.stringify({
        ok: true,
        checkedUrl: `${finalUrl.origin}${finalUrl.pathname}`,
        engine: options.engine,
        targetLanguage: options.targetLanguage,
        nativeDownloadsAllowed: options.allowNativeDownloads,
        academySurface: surface.ok,
        injected: true,
        translated: true,
        actualCandidateTranslated: Boolean(translated.actualCandidate),
        restored: true
      })
    );
  } finally {
    if (routeGuard) routeGuard.stop();
    if (page) await cleanupProbe(page);
    await context.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = Object.freeze({
  ROOT,
  assessRestoredProbe,
  assessAcademySurface,
  assessTranslatedProbe,
  canonicalPath,
  createPageRouteGuard,
  createSentinelSource,
  main,
  normalizedPathname,
  parseArgumentMap,
  parseOptions,
  pathIsWithin,
  validateAcademyUrl,
  validateAcademyRedirectChain,
  validateFinalAcademyUrl
});
