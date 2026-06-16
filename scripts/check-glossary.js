const { existsSync, readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "src", "data");
const REQUIRED_PROTECTED_TERMS = [
  "OpenAI",
  "OpenAI Academy",
  "ChatGPT",
  "GPT",
  "GPT-5",
  "GPT-4",
  "LLM",
  "API",
  "SDK",
  "JSON",
  "JSON Schema",
  "Responses API",
  "Agents SDK",
  "Gradual",
  "Google Translate"
];
const REQUIRED_REVIEWED_CATEGORIES = [
  "academy-learning",
  "prompting",
  "model-concepts",
  "workflow",
  "agents",
  "structured-output",
  "evaluation"
];
const REQUIRED_REVIEWED_TERMS = [
  "clear instructions",
  "context",
  "review outputs",
  "repeatable ways of working",
  "agents",
  "structured outputs",
  "guardrails",
  "evals"
];

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalized(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function assertOfficialSourceUrl(id, url) {
  assert(
    /^https:\/\/(academy\.openai\.com|developers\.openai\.com|platform\.openai\.com)\//.test(url),
    `Non-official source URL: ${id}`
  );
}

function assertProtectedTerms(terms, label) {
  assert(Array.isArray(terms), `${label} must include protectedTerms array`);
  for (const term of REQUIRED_PROTECTED_TERMS) {
    assert(terms.includes(term), `${label} missing protected term: ${term}`);
  }
}

function assertGlossary(record) {
  const glossary = readJson(record.path);
  const locale = record.locale;
  assert(glossary.locale === locale, `Glossary locale mismatch for ${record.path}`);
  assert(glossary.sourceCatalog && typeof glossary.sourceCatalog === "object", `${locale} missing sourceCatalog`);
  assertProtectedTerms(glossary.protectedTerms, `${locale} glossary`);
  assert(Array.isArray(glossary.terms), `${locale} glossary must include terms array`);
  assert(record.termCount === glossary.terms.length, `${locale} registry termCount is stale`);

  const sourceIds = new Set(Object.keys(glossary.sourceCatalog));
  for (const [id, source] of Object.entries(glossary.sourceCatalog)) {
    assert(source.title, `${locale} source catalog entry missing title: ${id}`);
    assertOfficialSourceUrl(id, source.url);
  }

  const protectedSet = new Set(glossary.protectedTerms.map(normalized));
  const seenTerms = new Map();
  const categories = new Set();
  let academyBacked = 0;
  let docsBacked = 0;

  for (const entry of glossary.terms) {
    assert(entry.source && entry.target, `${locale} term must include source and target`);
    const key = normalized(entry.source);
    assert(!seenTerms.has(key), `${locale} duplicate glossary source: ${entry.source}`);
    seenTerms.set(key, entry);
    assert(!protectedSet.has(key), `${locale} term duplicates protected term: ${entry.source}`);
    assert(entry.category, `${locale} term missing category: ${entry.source}`);
    assert(Array.isArray(entry.sources) && entry.sources.length > 0, `${locale} term missing sources: ${entry.source}`);
    assert(entry.note && entry.note.length >= 12, `${locale} term note is too thin: ${entry.source}`);

    categories.add(entry.category);
    for (const sourceId of entry.sources) {
      assert(sourceIds.has(sourceId), `${locale} unknown source id "${sourceId}" on term: ${entry.source}`);
      if (sourceId.startsWith("academy:")) academyBacked += 1;
      if (sourceId.startsWith("openai-docs:")) docsBacked += 1;
    }
  }

  if (record.status === "reviewed") {
    for (const required of REQUIRED_REVIEWED_CATEGORIES) {
      assert(categories.has(required), `${locale} reviewed glossary missing category: ${required}`);
    }
    for (const required of REQUIRED_REVIEWED_TERMS) {
      assert(seenTerms.has(required), `${locale} reviewed glossary missing term: ${required}`);
    }
    assert(glossary.terms.length >= 45, `${locale} reviewed glossary should keep at least 45 terms`);
    assert(academyBacked >= 20, `${locale} reviewed glossary needs stronger Academy source coverage`);
    assert(docsBacked >= 30, `${locale} reviewed glossary needs stronger OpenAI docs source coverage`);
  } else {
    assert(glossary.terms.length >= 8, `${locale} draft glossary should keep at least 8 terms`);
  }

  return { categories: categories.size, terms: glossary.terms.length };
}

const index = readJson("src/data/glossary.index.json");
assert(index.schemaVersion === 1, "Glossary registry schemaVersion must be 1");
assertProtectedTerms(index.protectedTerms, "Glossary registry");
assert(Array.isArray(index.glossaries), "Glossary registry must include glossaries array");

const registeredPaths = new Set();
const registeredLocales = new Set();
let totalTerms = 0;

for (const record of index.glossaries) {
  assert(record.locale, "Glossary registry entry missing locale");
  assert(record.path, `Glossary registry entry missing path for ${record.locale}`);
  assert(["draft", "reviewed"].includes(record.status), `Unknown glossary status for ${record.locale}`);
  assert(!registeredLocales.has(record.locale), `Duplicate registered locale: ${record.locale}`);
  assert(!registeredPaths.has(record.path), `Duplicate registered glossary path: ${record.path}`);
  assert(existsSync(join(ROOT, record.path)), `Registered glossary file does not exist: ${record.path}`);

  registeredLocales.add(record.locale);
  registeredPaths.add(record.path);
  const result = assertGlossary(record);
  totalTerms += result.terms;
}

const glossaryFiles = readdirSync(DATA_DIR)
  .filter((file) => /^glossary\.(?!index\.json$)[^.]+\.json$/.test(file))
  .map((file) => `src/data/${file}`)
  .sort();

for (const path of glossaryFiles) {
  assert(registeredPaths.has(path), `Glossary file is not registered: ${path}`);
}

assert(registeredLocales.has("ko"), "Korean glossary should remain registered while it is the first reviewed pack");

console.log(`glossaries ok (${index.glossaries.length} registered, ${totalTerms} terms)`);
