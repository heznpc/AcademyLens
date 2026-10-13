const assert = require("node:assert/strict");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const ReadingAssistant = require("../src/content/reading-assistant.js");

function harness(options = {}) {
  const dom = new JSDOM("<main><p id='one'>翻訳文</p><p id='two'>別の翻訳文</p><a href='/next'>Next lesson</a></main>", {
    url: "https://academy.openai.com/ja/learn/course/lesson"
  });
  const document = dom.window.document;
  const records = ["one", "two"].map((id, index) => {
    const target = document.getElementById(id);
    target.scrollIntoView = () => {};
    return { target, originalText: index ? "A second passage." : (options.original || "An AI model responds to a prompt."), translated: target.textContent };
  });
  const settings = { targetLanguage: "ja", translationEngine: "device", providerRevision: 0 };
  const calls = [];
  const runtime = {
    currentRecords: () => records,
    isCurrentRecordStillOwned: (record) => record.target.isConnected && record.target.textContent === record.translated,
    recordTarget: (record) => record.target,
    recordForTarget: (target) => records.find((record) => record.target === target) || null
  };
  const reader = ReadingAssistant.create({
    document, window: dom.window, domTranslation: runtime, uiLocale: "en",
    getSettings: () => settings,
    getGlossary: () => options.glossary || null,
    getContext: () => ({ title: "Course", heading: "AI basics" }),
    explain: (request) => {
      calls.push(request);
      return options.explain ? options.explain(request) : Promise.resolve({ ok: true, text: "日本語の説明", provider: "test-model" });
    }
  });
  reader.start();
  const shadow = document.querySelector("[data-academylens-reader]").shadowRoot;
  return { reader, shadow, records, settings, calls, document, close: () => { reader.stop(); dom.window.close(); } };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

test("original is immediate inert text and does not trigger AI or alter translated content", () => {
  const h = harness({ original: "Do not run <img src=x onerror=alert(1)> in a prompt." });
  try {
    h.reader.open(h.records[0]);
    assert.equal(h.shadow.querySelector("[data-original]").textContent, h.records[0].originalText);
    assert.equal(h.shadow.querySelector("[data-original] img"), null);
    assert.equal(h.records[0].target.textContent, "翻訳文");
    assert.equal(h.calls.length, 0);
    assert.equal(h.shadow.querySelector("[data-translated]").lang, "ja");
  } finally { h.close(); }
});

test("explicit explanation uses selected language and reset aborts and discards late output", async () => {
  let resolve;
  const h = harness({ explain: () => new Promise((done) => { resolve = done; }) });
  try {
    h.reader.open(h.records[0]);
    h.shadow.querySelector("[data-explain]").click();
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].targetLanguage, "ja");
    assert.equal(h.calls[0].original, h.records[0].originalText);
    h.reader.reset();
    assert.equal(h.calls[0].signal.aborted, true);
    resolve({ ok: true, text: "Stale response", provider: "test-model" });
    await settle();
    assert.equal(h.shadow.querySelector("[data-notes]").textContent, "");
  } finally { h.close(); }
});

test("reference notes show source provenance and only safe links, without treating glossary notes as definitions", async () => {
  const h = harness({
    glossary: {
      terms: [{ source: "model", target: "モデル", note: "EDITORIAL INSTRUCTION", sources: ["model-doc"] }],
      sourceCatalog: { "model-doc": { title: "Model concepts", url: "https://developers.openai.com/" } }
    },
    explain: async () => ({ ok: true, text: "モデルの説明", kind: "reference", provider: "curated-device", sources: [
      { title: "Reference", url: "https://developers.openai.com/" },
      { title: "Unsafe", url: "javascript:alert(1)" }
    ] })
  });
  try {
    h.reader.open(h.records[0]);
    h.shadow.querySelector("[data-explain]").click();
    await settle();
    assert.match(h.shadow.querySelector("[data-status]").textContent, /Source-based terminology note/);
    assert.doesNotMatch(h.shadow.textContent, /EDITORIAL INSTRUCTION/);
    assert.equal(h.shadow.querySelectorAll("[data-note-sources] a").length, 1);
    assert.equal(h.shadow.querySelector("[data-note-sources] a").rel, "noopener noreferrer");
  } finally { h.close(); }
});

test("keyboard-accessible reader controls move between passages without rewriting them", () => {
  const h = harness();
  try {
    h.shadow.querySelector("[data-open]").click();
    assert.equal(h.shadow.querySelector("[data-open]").getAttribute("aria-expanded"), "true");
    h.shadow.querySelector("[aria-label='Next passage']").click();
    assert.equal(h.shadow.querySelector("[data-original]").textContent, "A second passage.");
    assert.equal(h.records[0].target.textContent, "翻訳文");
    assert.equal(h.records[1].target.textContent, "別の翻訳文");
  } finally { h.close(); }
});

test("provider revision partitions explanation cache and new context objects keep their values", async () => {
  const h = harness();
  try {
    h.reader.open(h.records[0]);
    h.shadow.querySelector("[data-explain]").click();
    await settle();
    h.shadow.querySelector("[data-explain]").click();
    await settle();
    assert.equal(h.calls.length, 1);
    h.settings.providerRevision = 1;
    h.shadow.querySelector("[data-explain]").click();
    await settle();
    assert.equal(h.calls.length, 2);
    assert.deepEqual(h.calls[1].context, { title: "Course", heading: "AI basics" });
  } finally { h.close(); }
});
