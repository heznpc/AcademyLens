const assert = require("node:assert/strict");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const Text = require("../src/lib/text-utils.js");
const DomTranslationRuntime = require("../src/content/dom-translation-runtime.js");

const LIMITS = Object.freeze({
  maxCandidateScanNodes: 600,
  maxTextLength: 1200,
  maxTextNodesPerPass: 120
});

function withDom(html, callback) {
  const dom = new JSDOM(html, {
    url: "https://academy.openai.com/public/courses/ai-foundations"
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

function createRuntime(document, options = {}) {
  let suppressions = 0;
  const runtime = DomTranslationRuntime.create({
    document,
    window: document.defaultView,
    Text,
    limits: LIMITS,
    getTargetLanguage: () => options.targetLanguage || "ko",
    getPanelElement: () => options.panel || null,
    suppressMutationReactions() {
      suppressions += 1;
    }
  });

  return {
    runtime,
    suppressions: () => suppressions
  };
}

test("collectCandidates merges safe inline lesson copy into one element candidate", () => {
  withDom(
    `
      <main>
        <p id="lesson">OpenAI Academy lessons teach <strong>ChatGPT</strong> workflows clearly.</p>
      </main>
    `,
    (document) => {
      const { runtime } = createRuntime(document);
      const candidates = runtime.collectCandidates();

      assert.equal(candidates.length, 1);
      assert.equal(candidates[0].kind, "element");
      assert.equal(candidates[0].target.id, "lesson");
      assert.equal(candidates[0].normalized, "OpenAI Academy lessons teach ChatGPT workflows clearly.");
    }
  );
});

test("inline placeholders preserve safe child elements during replacement", () => {
  withDom(
    `
      <main>
        <p id="lesson">OpenAI Academy lessons teach <strong>ChatGPT</strong> workflows clearly.</p>
      </main>
    `,
    (document) => {
      const { runtime, suppressions } = createRuntime(document);
      const candidate = runtime.collectCandidates()[0];
      const prepared = runtime.prepareInlinePlaceholders(candidate, {
        text: candidate.normalized,
        placeholders: []
      });

      assert.match(prepared.text, /__AL_INLINE_0__/);
      assert.equal(
        runtime.applyCandidateTranslation(
          candidate,
          "명확하게 __AL_INLINE_0__ 워크플로를 배웁니다.",
          prepared.inlinePlaceholders
        ),
        true
      );
      assert.equal(document.querySelector("#lesson strong").textContent, "ChatGPT");
      assert.match(document.querySelector("#lesson").innerHTML, /<strong>ChatGPT<\/strong>/);
      assert.equal(suppressions(), 1);
    }
  );
});

test("recorded text candidates are skipped until restored", () => {
  withDom(
    `
      <main>
        <p id="lesson">OpenAI Academy lessons explain practical workflows clearly.</p>
      </main>
    `,
    (document) => {
      const { runtime } = createRuntime(document);
      const candidate = runtime.collectCandidates()[0];

      assert.equal(candidate.kind, "text");
      assert.equal(runtime.applyCandidateTranslation(candidate, "Translated lesson still uses Latin words."), true);
      assert.equal(runtime.collectCandidates().length, 0);
      assert.equal(runtime.restoreAllRecords(), 1);
      assert.equal(
        Text.normalizeWhitespace(document.querySelector("#lesson").textContent),
        "OpenAI Academy lessons explain practical workflows clearly."
      );
    }
  );
});

test("restoreAllRecords does not overwrite site-updated text", () => {
  withDom(
    `
      <main>
        <p id="lesson">OpenAI Academy lessons explain practical workflows clearly.</p>
      </main>
    `,
    (document) => {
      const { runtime } = createRuntime(document);
      const candidate = runtime.collectCandidates()[0];

      assert.equal(runtime.applyCandidateTranslation(candidate, "Translated lesson still uses Latin words."), true);
      document.querySelector("#lesson").firstChild.textContent = "Site updated this lesson.";

      assert.equal(runtime.restoreAllRecords(), 0);
      assert.equal(
        Text.normalizeWhitespace(document.querySelector("#lesson").textContent),
        "Site updated this lesson."
      );
    }
  );
});

test("recordForClickedElement finds translated records and ignores panel clicks", () => {
  withDom(
    `
      <main>
        <p id="lesson">OpenAI Academy lessons teach <strong>ChatGPT</strong> workflows clearly.</p>
      </main>
      <aside id="panel"><button>Save</button></aside>
    `,
    (document) => {
      const panel = document.querySelector("#panel");
      const { runtime } = createRuntime(document, { panel });
      const candidate = runtime.collectCandidates()[0];

      assert.equal(runtime.applyCandidateTranslation(candidate, "번역된 ChatGPT workflow", null), true);
      assert.equal(
        runtime.recordForClickedElement(document.querySelector("#lesson strong")).normalized,
        candidate.normalized
      );
      assert.equal(runtime.recordForClickedElement(panel.querySelector("button")), null);
    }
  );
});

test("directGlossaryTranslation returns glossary-only protected terms", () => {
  withDom("<main></main>", (document) => {
    const { runtime } = createRuntime(document);

    assert.equal(
      runtime.directGlossaryTranslation({
        text: "__AL_TERM_0__",
        placeholders: [{ token: "__AL_TERM_0__", value: "ChatGPT" }]
      }),
      "ChatGPT"
    );
    assert.equal(
      runtime.directGlossaryTranslation({
        text: "Learn __AL_TERM_0__",
        placeholders: [{ token: "__AL_TERM_0__", value: "ChatGPT" }]
      }),
      ""
    );
  });
});
