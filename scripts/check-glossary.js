const { existsSync, readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { ALLOWED_GLOSSARY_STATUSES, PREMIUM_LOCALE_RECORDS, QUALITY_SMOKE_TERMS } = require("./lib/glossary-config.js");

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
const REQUIRED_PREMIUM_LOCALES = PREMIUM_LOCALE_RECORDS.map((record) => record.locale);

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSameStringSet(actual, expected, message) {
  assert(actual.length === expected.length, message);
  for (let index = 0; index < expected.length; index += 1) {
    assert(actual[index] === expected[index], message);
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
  assert(glossary.schemaVersion === 1, `${locale} glossary schemaVersion must be 1`);
  assert(glossary.status === record.status, `${locale} glossary status must match registry`);
  assert(glossary.sourceCatalog && typeof glossary.sourceCatalog === "object", `${locale} missing sourceCatalog`);
  assertProtectedTerms(glossary.protectedTerms, `${locale} glossary`);
  assert(Array.isArray(glossary.terms), `${locale} glossary must include terms array`);
  assert(record.termCount === glossary.terms.length, `${locale} registry termCount is stale`);
  assert(record.officialAlignment, `${locale} registry missing officialAlignment`);
  assert(record.xTranslationCheck, `${locale} registry missing xTranslationCheck`);
  assert(glossary.qaSignals && typeof glossary.qaSignals === "object", `${locale} glossary missing qaSignals`);
  assert(glossary.qaSignals.xTranslationCheck, `${locale} glossary missing X translation QA signal`);
  assert(glossary.qaSignals.communityReview, `${locale} glossary missing community review signal`);

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

  assertQualitySmokeTerms(locale, seenTerms);

  if (record.status === "reviewed" || record.status === "native-reviewed" || record.status === "community-reviewed") {
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
    assert(glossary.terms.length >= 45, `${locale} premium draft glossary should keep at least 45 terms`);
    assert(academyBacked >= 20, `${locale} premium draft needs Academy source coverage`);
    assert(docsBacked >= 30, `${locale} premium draft needs OpenAI docs source coverage`);
  }

  return { categories: categories.size, terms: glossary.terms.length, termKeys: [...seenTerms.keys()].sort() };
}

function assertQualitySmokeTerms(locale, seenTerms) {
  const smokeTerms = QUALITY_SMOKE_TERMS[locale] || {};
  for (const [source, expectedTarget] of Object.entries(smokeTerms)) {
    const entry = seenTerms.get(normalized(source));
    assert(entry, `${locale} quality smoke term missing: ${source}`);
    assert(
      entry.target === expectedTarget,
      `${locale} quality smoke mismatch for "${source}": expected "${expectedTarget}", got "${entry.target}"`
    );
  }
}

const index = readJson("src/data/glossary.index.json");
assert(index.schemaVersion === 1, "Glossary registry schemaVersion must be 1");
assertProtectedTerms(index.protectedTerms, "Glossary registry");
assert(Array.isArray(index.premiumLocales), "Glossary registry must include premiumLocales array");
assertSameStringSet(
  index.premiumLocales.slice().sort(),
  REQUIRED_PREMIUM_LOCALES.slice().sort(),
  "Premium locale registry drift"
);
assert(Array.isArray(index.qaLayers) && index.qaLayers.length >= 4, "Glossary registry must document QA layers");
assert(Array.isArray(index.glossaries), "Glossary registry must include glossaries array");

const registeredPaths = new Set();
const registeredLocales = new Set();
let totalTerms = 0;
let baselineTermKeys = null;
let baselineLocale = "";

for (const record of index.glossaries) {
  assert(record.locale, "Glossary registry entry missing locale");
  assert(record.path, `Glossary registry entry missing path for ${record.locale}`);
  assert(ALLOWED_GLOSSARY_STATUSES.includes(record.status), `Unknown glossary status for ${record.locale}`);
  assert(!registeredLocales.has(record.locale), `Duplicate registered locale: ${record.locale}`);
  assert(!registeredPaths.has(record.path), `Duplicate registered glossary path: ${record.path}`);
  assert(existsSync(join(ROOT, record.path)), `Registered glossary file does not exist: ${record.path}`);

  registeredLocales.add(record.locale);
  registeredPaths.add(record.path);
  const result = assertGlossary(record);
  totalTerms += result.terms;
  if (!baselineTermKeys) {
    baselineTermKeys = result.termKeys;
    baselineLocale = record.locale;
  } else {
    assertSameStringSet(
      result.termKeys,
      baselineTermKeys,
      `${record.locale} source key set differs from ${baselineLocale}`
    );
  }
}

const glossaryFiles = readdirSync(DATA_DIR)
  .filter((file) => /^glossary\.(?!index\.json$)[^.]+\.json$/.test(file))
  .map((file) => `src/data/${file}`)
  .sort();

for (const path of glossaryFiles) {
  assert(registeredPaths.has(path), `Glossary file is not registered: ${path}`);
}

for (const locale of REQUIRED_PREMIUM_LOCALES) {
  assert(registeredLocales.has(locale), `Missing premium glossary locale: ${locale}`);
}

console.log(`glossaries ok (${index.glossaries.length} registered, ${totalTerms} terms)`);
