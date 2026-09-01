const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { mkdtempSync, rmSync, symlinkSync } = require("node:fs");
const os = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const TranslationQuality = require("../src/lib/translation-quality.js");
const LiveQa = require("../scripts/qa-live-extension.js");

function externalProfile(name = "academylens-live-qa-unit-profile") {
  return join(os.tmpdir(), name);
}

test("live extension QA parses explicit validated options without launching a browser", () => {
  const options = LiveQa.parseOptions(
    [
      "--url",
      "https://academy.openai.com/pages/courses/",
      "--target",
      "es-MX",
      "--engine",
      "remote",
      "--profile",
      externalProfile(),
      "--channel",
      "chromium",
      "--timeout",
      "45000",
      "--headless"
    ],
    {}
  );

  assert.equal(options.url, "https://academy.openai.com/pages/courses/");
  assert.equal(options.targetLanguage, "es");
  assert.equal(options.engine, "remote");
  assert.equal(options.timeout, 45000);
  assert.equal(options.headless, true);
  assert.equal(options.allowNativeDownloads, false);
});

test("live extension QA keeps native model downloads behind an explicit device-only flag", () => {
  const device = LiveQa.parseOptions(
    ["--engine", "device", "--profile", externalProfile(), "--allow-native-downloads"],
    {}
  );
  assert.equal(device.allowNativeDownloads, true);

  assert.throws(
    () => LiveQa.parseOptions(["--engine", "remote", "--profile", externalProfile(), "--allow-native-downloads"], {}),
    /only be used with --engine device/
  );
});

test("live extension QA rejects argument and engine typos instead of falling back to device", () => {
  assert.throws(
    () => LiveQa.parseOptions(["--engine", "remtoe", "--profile", externalProfile()], {}),
    /Unknown live QA translation engine: remtoe/
  );
  assert.throws(
    () => LiveQa.parseOptions(["--engin", "remote", "--profile", externalProfile()], {}),
    /Unknown live QA argument: --engin/
  );
  assert.throws(() => LiveQa.parseOptions(["--engine"], {}), /Missing value/);
  assert.throws(
    () => LiveQa.parseOptions(["--engine", "remtoe", "--engine", "device", "--profile", externalProfile()], {}),
    /Duplicate live QA argument: --engine/
  );
});

test("live extension QA rejects invalid targets, timeouts, and repository-local profiles", () => {
  for (const timeout of ["0", "-1", "NaN", "Infinity"]) {
    assert.throws(
      () => LiveQa.parseOptions(["--timeout", timeout, "--profile", externalProfile()], {}),
      /timeout must be a positive number/,
      timeout
    );
  }
  assert.throws(
    () => LiveQa.parseOptions(["--target", "en", "--profile", externalProfile()], {}),
    /supported non-English target/
  );
  assert.throws(
    () => LiveQa.parseOptions(["--profile", join(LiveQa.ROOT, ".qa-profile")], {}),
    /outside the repository/
  );

  const sibling = resolve(LiveQa.ROOT, "..", "academy-lens-qa-profile");
  assert.equal(LiveQa.parseOptions(["--profile", sibling], {}).profile, sibling);
});

test("live extension QA rejects a repository profile reached through an external symlink", (context) => {
  const temporary = mkdtempSync(join(os.tmpdir(), "academylens-live-qa-link-"));
  context.after(() => rmSync(temporary, { force: true, recursive: true }));
  const alias = join(temporary, "repository-alias");
  symlinkSync(LiveQa.ROOT, alias, "dir");

  assert.equal(LiveQa.pathIsWithin(LiveQa.ROOT, join(alias, ".qa-profile")), true);
  assert.throws(() => LiveQa.parseOptions(["--profile", join(alias, ".qa-profile")], {}), /outside the repository/);
});

test("live extension QA rejects cross-host, auth, error, and unexpected same-host redirects", () => {
  const requested = "https://academy.openai.com/pages/courses";
  assert.equal(
    LiveQa.validateFinalAcademyUrl(`${requested}?author=academy`, `${requested}?author=academy`).search,
    "?author=academy"
  );
  assert.equal(
    LiveQa.validateFinalAcademyUrl(requested, "https://academy.openai.com/pages/courses/").pathname,
    "/pages/courses/"
  );
  assert.throws(
    () => LiveQa.validateFinalAcademyUrl(requested, "https://academy.openai.com/login"),
    /authentication or error route/
  );
  assert.throws(
    () => LiveQa.validateFinalAcademyUrl(requested, "https://academy.openai.com/pages/courses/error"),
    /authentication or error route/
  );
  assert.throws(
    () => LiveQa.validateFinalAcademyUrl(requested, "https://academy.openai.com/public/courses/example"),
    /unexpected route/
  );
  assert.throws(
    () => LiveQa.validateFinalAcademyUrl(requested, `${requested}?error=unauthorized`),
    /authentication or error route/
  );
  assert.throws(
    () => LiveQa.validateFinalAcademyUrl(requested, `${requested}?next=%2Flogin`),
    /authentication or error route/
  );
  assert.throws(() => LiveQa.validateFinalAcademyUrl(requested, `${requested}?view=grid`), /unexpected route/);
  assert.throws(
    () => LiveQa.validateFinalAcademyUrl(requested, "https://academy.openai.com.evil.example/pages/courses"),
    /Academy URL/
  );
});

test("live extension QA remembers a late wrong SPA route even if the page returns", () => {
  const requested = "https://academy.openai.com/pages/courses";
  class FakePage extends EventEmitter {
    constructor() {
      super();
      this.currentUrl = requested;
      this.frame = { url: () => this.currentUrl };
    }

    mainFrame() {
      return this.frame;
    }

    url() {
      return this.currentUrl;
    }

    navigate(url) {
      this.currentUrl = url;
      this.emit("framenavigated", this.frame);
    }
  }

  const page = new FakePage();
  const guard = LiveQa.createPageRouteGuard(page, requested);
  page.navigate("https://academy.openai.com/login");
  page.navigate(requested);
  assert.throws(() => guard.assert(), /authentication or error route/);
  guard.stop();
});

test("live extension QA rejects a wrong route hidden inside the HTTP redirect chain", () => {
  const requested = "https://academy.openai.com/pages/courses";
  const initialRequest = { url: () => requested, redirectedFrom: () => null };
  const loginRequest = {
    url: () => "https://academy.openai.com/login",
    redirectedFrom: () => initialRequest
  };
  const finalRequest = { url: () => requested, redirectedFrom: () => loginRequest };
  const response = { request: () => finalRequest };

  assert.throws(() => LiveQa.validateAcademyRedirectChain(requested, response), /authentication or error route/);
});

test("live extension QA requires both a primary surface and course links", () => {
  const valid = LiveQa.assessAcademySurface({
    counts: { document: 2, primary: 1, courseLinks: 4, primaryCourseSurface: 1 },
    bodyTextLength: 500,
    title: "OpenAI Academy"
  });
  assert.deepEqual(valid.failures, []);

  const missing = LiveQa.assessAcademySurface({
    counts: { document: 2, primary: 0, courseLinks: 0, primaryCourseSurface: 0 },
    bodyTextLength: 20,
    title: "Sign in"
  });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.failures, [
    "primary-surface-missing",
    "course-links-missing",
    "visible-primary-course-surface-missing",
    "public-page-content-too-small",
    "authentication-or-error-title"
  ]);

  const hiddenStaleCourseLink = LiveQa.assessAcademySurface({
    counts: { document: 2, primary: 1, courseLinks: 1, primaryCourseSurface: 0 },
    bodyTextLength: 500,
    title: "OpenAI Academy",
    authenticationOrErrorSurface: true
  });
  assert.deepEqual(hiddenStaleCourseLink.failures, [
    "visible-primary-course-surface-missing",
    "authentication-or-error-surface"
  ]);
});

test("live extension QA creates a cache-unique natural-language sentinel for every run", () => {
  assert.notEqual(LiveQa.createSentinelSource(), LiveQa.createSentinelSource());
  const first = LiveQa.createSentinelSource("run-1");
  const second = LiveQa.createSentinelSource("run-2");
  const verificationNumber = first.match(/Verification number (\d+)\.$/)[1];

  assert.notEqual(first, second);
  assert.match(first, /Verification number \d+\.$/);
  assert.equal(
    TranslationQuality.validate(
      first,
      `명확한 지침으로 신뢰할 수 있는 에이전트를 구축합니다. 검증 번호 ${verificationNumber}.`,
      "ko"
    ).ok,
    true
  );
});

test("live extension QA requires both the sentinel and a real Academy candidate to translate", () => {
  const probe = {
    sentinelSource: LiveQa.createSentinelSource("assessment"),
    candidates: [
      {
        id: "candidate-1",
        original: "Build practical skills with guided exercises and clear examples."
      }
    ]
  };
  const sentinelTranslation = "명확한 지침과 사람의 감독으로 신뢰할 수 있는 에이전트를 구축합니다.";
  const candidateTranslation = "안내된 연습과 명확한 예시로 실용적인 기술을 익힙니다.";

  assert.deepEqual(
    LiveQa.assessTranslatedProbe(
      probe,
      {
        sentinelExists: true,
        sentinelText: sentinelTranslation,
        actual: [{ id: "candidate-1", exists: true, text: probe.candidates[0].original }]
      },
      "ko"
    ).failures,
    ["academy-candidate-not-translated"]
  );
  assert.deepEqual(
    LiveQa.assessTranslatedProbe(
      probe,
      {
        sentinelExists: true,
        sentinelText: probe.sentinelSource,
        actual: [{ id: "candidate-1", exists: true, text: candidateTranslation }]
      },
      "ko"
    ).failures,
    ["sentinel-not-translated"]
  );
  assert.deepEqual(
    LiveQa.assessTranslatedProbe(
      probe,
      {
        sentinelExists: true,
        sentinelText: sentinelTranslation,
        actual: [{ id: "candidate-1", exists: true, text: "Completely unrelated English sentence." }]
      },
      "ko"
    ).failures,
    ["academy-candidate-not-translated"]
  );

  const accepted = LiveQa.assessTranslatedProbe(
    probe,
    {
      sentinelExists: true,
      sentinelText: sentinelTranslation,
      actual: [{ id: "candidate-1", exists: true, text: candidateTranslation }]
    },
    "ko"
  );
  assert.equal(accepted.ok, true);
  assert.equal(accepted.actualCandidate.id, "candidate-1");
});

test("live extension QA restore proof requires exact sentinel and every Academy candidate", () => {
  const probe = {
    sentinelSource: LiveQa.createSentinelSource("restore"),
    candidates: [
      { id: "candidate-1", original: "First existing Academy course description." },
      { id: "candidate-2", original: "Second existing Academy course description." }
    ]
  };
  const partial = LiveQa.assessRestoredProbe(probe, {
    sentinelExists: true,
    sentinelText: probe.sentinelSource,
    actual: [
      { id: "candidate-1", exists: true, text: probe.candidates[0].original },
      { id: "candidate-2", exists: false, text: "" }
    ]
  });
  assert.equal(partial.ok, false);
  assert.equal(partial.candidatesRestored, 1);

  const exact = LiveQa.assessRestoredProbe(probe, {
    sentinelExists: true,
    sentinelText: probe.sentinelSource,
    actual: probe.candidates.map((candidate) => ({ id: candidate.id, exists: true, text: candidate.original }))
  });
  assert.equal(exact.ok, true);
  assert.equal(exact.candidatesRestored, 2);
});
