const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { JSDOM } = require("jsdom");

const Glossary = require("../src/lib/glossary.js");
const Text = require("../src/lib/text-utils.js");

const ROOT = join(__dirname, "..");
const FIXTURES = [
  "tests/fixtures/openai-academy-public-course.html",
  "tests/fixtures/gradual-course-fragment.html",
  "tests/fixtures/gradual-study-room-fragment.html"
];
const SAMPLE_TEXTS = [
  "JSON API examples stay readable.",
  "OpenAI Academy lessons use JSON and SDK examples.",
  "Practice deciding what to delegate to AI while staying in control of the final work.",
  "This course is designed for people who are new to AI or want a stronger foundation for using AI effectively at work."
];

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function placeholderCount(text) {
  return (String(text).match(/__AL_TERM_\d+__/g) || []).length;
}

function wordCount(text) {
  return Text.normalizeWhitespace(text).split(/\s+/).filter(Boolean).length;
}

function assertPreparedTextLooksSafe(text, prepared, label) {
  const placeholders = placeholderCount(prepared.text);
  const words = Math.max(1, wordCount(text));
  const density = placeholders / words;
  assert(placeholders <= 8, `${label} has too many glossary placeholders: ${prepared.text}`);
  assert(density <= 0.7, `${label} has suspicious glossary placeholder density: ${prepared.text}`);
}

function fixtureTextNodes(path) {
  const html = readFileSync(join(ROOT, path), "utf8");
  const dom = new JSDOM(html);
  global.document = dom.window.document;
  global.NodeFilter = dom.window.NodeFilter;
  const nodes = Text.collectTranslatableTextNodes(dom.window.document.body, {
    targetLanguage: "ko",
    maxNodes: 200,
    maxTextLength: 1200
  });
  delete global.document;
  delete global.NodeFilter;
  return nodes.map((node) => Text.normalizeWhitespace(node.textContent)).filter(Boolean);
}

function main() {
  const glossary = Glossary.normalizeGlossary(readJson("src/data/glossary.ko.json"));
  const samples = [...SAMPLE_TEXTS];
  for (const fixture of FIXTURES) {
    samples.push(...fixtureTextNodes(fixture));
  }

  const uniqueSamples = [...new Set(samples)];
  for (const sample of uniqueSamples) {
    const prepared = Glossary.prepareForTranslation(sample, glossary, "ko");
    assertPreparedTextLooksSafe(sample, prepared, sample);
  }

  console.log(`glossary overreach ok (${uniqueSamples.length} text samples)`);
}

main();
