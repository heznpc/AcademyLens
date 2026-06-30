const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const Text = require("../src/lib/text-utils.js");

function withDom(html, callback) {
  const dom = new JSDOM(html, {
    url: "https://academy.openai.com/public/courses/ai-foundations-juzjs"
  });
  const previous = {
    window: global.window,
    document: global.document,
    NodeFilter: global.NodeFilter
  };

  global.window = dom.window;
  global.document = dom.window.document;
  global.NodeFilter = dom.window.NodeFilter;

  try {
    return callback(dom.window.document);
  } finally {
    global.window = previous.window;
    global.document = previous.document;
    global.NodeFilter = previous.NodeFilter;
    dom.window.close();
  }
}

test("collectTranslatableTextNodes skips Gradual chrome, code, hidden, and already Korean text", () => {
  const html = readFileSync(join(__dirname, "fixtures/gradual-course-fragment.html"), "utf8");

  withDom(html, (document) => {
    const nodes = Text.collectTranslatableTextNodes(document.body, {
      targetLanguage: "ko",
      maxNodes: 20,
      maxTextLength: 1200
    });
    const values = nodes.map((node) => Text.normalizeWhitespace(node.textContent));

    assert(values.includes("AI Foundations"));
    assert(values.includes("OpenAI Academy courses help people build practical AI skills."));
    assert(values.includes("Agents and workflows help structure repeated work."));
    assert(!values.some((value) => value.includes("Courses Search Sign in")));
    assert(!values.some((value) => value.includes("Home Events Forum")));
    assert(!values.some((value) => value.includes("Do not translate code")));
    assert(!values.some((value) => value.includes("Go to course")));
    assert(!values.some((value) => value.includes("cookies")));
    assert(!values.some((value) => value.includes("Accept All")));
    assert(!values.some((value) => value.includes("Cookie Policy")));
    assert(!values.some((value) => value.includes("hidden paragraph")));
    assert(!values.some((value) => value.includes("이미 한국어")));
  });
});

test("collectTranslatableTextNodes skips text hidden by ancestors and inert containers", () => {
  withDom(
    `
      <main>
        <section style="display: none"><p>Hidden by CSS ancestor</p></section>
        <section aria-hidden="true"><p>Hidden by ARIA ancestor</p></section>
        <section inert><p>Hidden by inert ancestor</p></section>
        <section style="visibility: hidden"><p>Hidden by visibility ancestor</p></section>
        <section><p>Visible course explanation</p></section>
      </main>
    `,
    (document) => {
      const nodes = Text.collectTranslatableTextNodes(document.body, {
        targetLanguage: "ko",
        maxNodes: 20,
        maxTextLength: 1200
      });
      const values = nodes.map((node) => Text.normalizeWhitespace(node.textContent));

      assert.deepEqual(values, ["Visible course explanation"]);
    }
  );
});

test("platform course controls are not treated as lesson copy", () => {
  for (const control of ["Start course", "START COURSE", "SKIP TO LESSON", "Continue", "CONTINUE"]) {
    assert.equal(Text.shouldTranslateText(control, "ko", 1200), false, `${control} should be skipped`);
  }
});

test("applyTranslatedText preserves surrounding whitespace and supports restore", () => {
  withDom("<main><p>  Agents and workflows.  </p></main>", (document) => {
    const node = document.querySelector("p").firstChild;
    const original = Text.applyTranslatedText(node, "에이전트와 워크플로.");

    assert.equal(original, "  Agents and workflows.  ");
    assert.equal(node.textContent, "  에이전트와 워크플로.  ");

    node.textContent = original;
    assert.equal(node.textContent, "  Agents and workflows.  ");
  });
});

test("actual OpenAI Academy public course fixture is recognized without translating Gradual chrome", () => {
  const html = readFileSync(join(__dirname, "fixtures/openai-academy-public-course.html"), "utf8");

  assert.match(html, /"page"\s*:\s*"\/public\/courses\/\[courseSlug\]"/);
  assert.match(html, /id="gradual-topbar"/);
  assert.match(html, /id="gradual-sidebar"/);
  assert(!/<script[^>]+src=/i.test(html));
  assert(!/sentry-trace|baggage|__CF\$cv|_buildManifest/i.test(html));
  assert(html.length < 10000);

  withDom(html, (document) => {
    const nodes = Text.collectTranslatableTextNodes(document.body, {
      targetLanguage: "ko",
      maxNodes: 200,
      maxTextLength: 1200
    });
    const combined = nodes.map((node) => Text.normalizeWhitespace(node.textContent)).join("\n");

    assert.equal(typeof combined, "string");
    assert(!combined.includes('"courses":{'));
    assert(!combined.includes("gradual-topbar"));
    assert(!combined.includes("Home\nEvents\nCourses"));
    assert(!combined.includes("Home"));
    assert(!combined.includes("Courses"));
    assert(!combined.includes("Participants"));
    assert(!combined.includes("Share"));
    assert(!combined.includes("Terms of Use"));
    assert(!combined.includes("Privacy Policy"));
    assert(!combined.includes("Code of Conduct"));
    assert(!combined.includes("Your Privacy Choices"));
    assert(!combined.includes("Switch language"));
  });
});

test("logged-in OpenAI Academy courses fixture translates course cards but skips account chrome", () => {
  const html = readFileSync(join(__dirname, "fixtures/openai-academy-logged-in-courses.html"), "utf8");

  assert.match(html, /academy-lens-fixture/);
  assert.match(html, /id="gradual-topbar"/);
  assert.match(html, /id="gradual-sidebar"/);
  assert(!/<script[^>]+src=/i.test(html));
  assert(!/sentry-trace|baggage|__CF\$cv|_buildManifest/i.test(html));

  withDom(html, (document) => {
    const nodes = Text.collectTranslatableTextNodes(document.body, {
      targetLanguage: "ko",
      maxNodes: 120,
      maxTextLength: 1200
    });
    const values = nodes.map((node) => Text.normalizeWhitespace(node.textContent));

    assert(values.includes("OpenAI Academy Courses"));
    assert(values.includes("AI Foundations"));
    assert(values.includes("Build practical skills for working with AI"));
    assert(values.includes("Prompt Engineering"));
    assert(values.includes("Practice writing clear instructions, context, and review criteria."));
    assert(values.includes("Building with Agents"));
    assert(values.includes("Learn how workflows, tools, and review steps help teams use agents responsibly."));
    assert(!values.includes("Search"));
    assert(!values.includes("Notifications"));
    assert(!values.includes("Account"));
    assert(!values.includes("Home"));
    assert(!values.includes("Courses"));
    assert(!values.includes("Powered by Gradual"));
    assert(!values.includes("Start learning"));
  });
});

test("logged-in study-room fixture translates lesson text but skips platform controls", () => {
  const html = readFileSync(join(__dirname, "fixtures/gradual-study-room-fragment.html"), "utf8");

  withDom(html, (document) => {
    const nodes = Text.collectTranslatableTextNodes(document.body, {
      targetLanguage: "ko",
      maxNodes: 80,
      maxTextLength: 1200
    });
    const values = nodes.map((node) => Text.normalizeWhitespace(node.textContent));

    assert(values.includes("Build practical AI skills for work"));
    assert(values.includes("Large language models can help draft repeatable workflows."));
    assert(values.includes("Review points help teams evaluate outputs responsibly."));
    assert(values.includes("Set clear context before using ChatGPT."));
    assert(values.includes("Reusable prompts help agents follow boundaries."));
    assert(!values.includes("2/5 Lessons Completed"));
    assert(!values.includes("Lesson 2 of 5"));
    assert(!values.includes("Complete"));
    assert(!values.includes("Course Certificate"));
    assert(!values.includes("View Certificate"));
    assert(!values.includes("Download PDF"));
    assert(!values.includes("Quiz Results"));
    assert(!values.includes("Start quiz"));
    assert(!values.includes("Submit"));
    assert(!values.includes("Account"));
    assert(!values.includes("Settings"));
  });
});

test("logged-in live lesson shell keeps Gradual controls out of the translation set", () => {
  const html = readFileSync(join(__dirname, "fixtures/gradual-live-lesson-shell.html"), "utf8");

  assert.match(html, /"page"\s*:\s*"\/learn\/\[courseSlug\]\/lessons\/\[lessonSlug\]"/);
  assert.match(html, /data-testid="lesson-content"/);
  assert(!/<script[^>]+src=/i.test(html));
  assert(!/sentry-trace|baggage|__CF\$cv|_buildManifest/i.test(html));

  withDom(html, (document) => {
    const nodes = Text.collectTranslatableTextNodes(document.body, {
      targetLanguage: "ko",
      maxNodes: 120,
      maxTextLength: 1200
    });
    const values = nodes.map((node) => Text.normalizeWhitespace(node.textContent));

    assert(values.includes("AI Foundations"));
    assert(values.includes("Build practical AI skills for work"));
    assert(values.includes("Set clear context before using ChatGPT."));
    assert(values.includes("Reusable prompts help agents follow boundaries."));
    assert(values.includes("Review points help teams evaluate outputs responsibly."));
    assert(values.includes("Reflection"));
    assert(values.includes("Practice deciding what to delegate to AI while staying in control of the final work."));
    assert(!values.includes("OpenAI Academy"));
    assert(!values.includes("Search"));
    assert(!values.includes("Notifications"));
    assert(!values.includes("Account"));
    assert(!values.includes("4/7 Lessons Completed"));
    assert(!values.includes("Lesson 4 of 7"));
    assert(!values.includes("Complete"));
    assert(!values.includes("Continue"));
    assert(!values.includes("Course Certificate"));
    assert(!values.includes("Knowledge Check"));
    assert(!values.includes("Start quiz"));
    assert(!values.includes("Submit"));
    assert(!values.includes("Saved"));
    assert(!values.some((value) => value.includes("Do not translate code")));
  });
});
