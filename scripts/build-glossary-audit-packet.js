const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
const DEFAULT_OUT_DIR = "dist/glossary-audit";
const SINGLE_WORD_OVERREACH_CATEGORIES = new Set([
  "academy-learning",
  "course-format",
  "model-concepts",
  "prompting",
  "review",
  "workflow"
]);

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

function writeJson(path, value) {
  writeFileSync(join(ROOT, path), `${JSON.stringify(value, null, 2)}\n`);
}

function ensureDir(path) {
  mkdirSync(join(ROOT, path), { recursive: true });
}

function normalized(value) {
  return String(value || "").trim();
}

function hasLatin(value) {
  return /[A-Za-z]/.test(value);
}

function isSingleWord(value) {
  return /^[A-Za-z][A-Za-z-]*$/.test(value);
}

function auditTerm(entry, glossary) {
  const flags = [];
  const source = normalized(entry.source);
  const target = normalized(entry.target);

  if (glossary.protectedTerms.includes(source)) flags.push("protected-term-collision");
  if (source === target) flags.push("target-same-as-source");
  if (isSingleWord(source) && SINGLE_WORD_OVERREACH_CATEGORIES.has(entry.category))
    flags.push("single-word-overreach-risk");
  if (hasLatin(target) && !glossary.protectedTerms.includes(target)) flags.push("latin-target-review");
  if (!entry.sources || entry.sources.length === 0) flags.push("missing-source");
  if (!entry.note || entry.note.length < 40) flags.push("thin-note");

  return {
    source,
    target,
    category: entry.category,
    sources: entry.sources || [],
    note: entry.note || "",
    flags
  };
}

function buildMarkdown(locale, glossary, auditedTerms) {
  const flagged = auditedTerms.filter((term) => term.flags.length > 0);
  const lines = [
    `# AcademyLens Glossary Audit Packet: ${locale}`,
    "",
    `Status: ${glossary.status}`,
    `Terms: ${glossary.terms.length}`,
    `Protected terms: ${glossary.protectedTerms.length}`,
    "",
    "## Reviewer Instructions",
    "",
    "- Mark terms that are unnatural, too literal, too broad, or should stay English.",
    "- Pay special attention to `single-word-overreach-risk` terms because they can alter ordinary course prose.",
    "- Treat this packet as review material, not as an official OpenAI translation source.",
    "- Preserve protected terms such as OpenAI, ChatGPT, GPT, API, SDK, JSON, Responses API, Agents SDK, Gradual, and Google Translate.",
    "",
    "## Flagged Terms",
    "",
    "| Source | Target | Category | Flags |",
    "| --- | --- | --- | --- |"
  ];

  for (const term of flagged) {
    lines.push(`| ${term.source} | ${term.target} | ${term.category} | ${term.flags.join(", ")} |`);
  }

  lines.push("", "## All Terms", "", "| Source | Target | Category | Sources |", "| --- | --- | --- | --- |");
  for (const term of auditedTerms) {
    lines.push(`| ${term.source} | ${term.target} | ${term.category} | ${term.sources.join(", ")} |`);
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const localeArg = argValue("--locale", "all");
  const outDir = argValue("--out", DEFAULT_OUT_DIR);
  const index = readJson("src/data/glossary.index.json");
  const records =
    localeArg === "all" ? index.glossaries : index.glossaries.filter((record) => record.locale === localeArg);

  if (records.length === 0) {
    throw new Error(`No glossary registered for locale: ${localeArg}`);
  }

  ensureDir(outDir);

  const summary = {
    generatedAt: new Date().toISOString(),
    locales: []
  };

  for (const record of records) {
    const glossary = readJson(record.path);
    const auditedTerms = glossary.terms.map((entry) => auditTerm(entry, glossary));
    const flagged = auditedTerms.filter((term) => term.flags.length > 0);
    const localeSummary = {
      locale: record.locale,
      status: record.status,
      termCount: glossary.terms.length,
      flaggedCount: flagged.length,
      flags: flagged.reduce((counts, term) => {
        for (const flag of term.flags) counts[flag] = (counts[flag] || 0) + 1;
        return counts;
      }, {})
    };

    summary.locales.push(localeSummary);
    writeJson(`${outDir}/${record.locale}.json`, {
      ...localeSummary,
      terms: auditedTerms
    });
    writeFileSync(join(ROOT, outDir, `${record.locale}.md`), buildMarkdown(record.locale, glossary, auditedTerms));
  }

  writeJson(`${outDir}/summary.json`, summary);
  console.log(`glossary audit packet written to ${outDir} (${records.length} locales)`);
}

main();
