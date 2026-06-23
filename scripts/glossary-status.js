const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
const INDEX_PATH = join(ROOT, "src", "data", "glossary.index.json");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function nextAction(record) {
  if (record.status === "reviewed") return "ready; keep regression coverage current";
  if (record.status === "native-reviewed") return "close official/X QA before reviewed";
  if (record.status === "community-reviewed") return "complete X check and native review";
  if (record.status === "llm-audited") return "request community/native review";
  return "audit high-risk terms, then request community/native review";
}

function printStatus(index = readJson(INDEX_PATH)) {
  const rows = index.glossaries.map((record) => ({
    locale: record.locale,
    language: record.language,
    status: record.status,
    terms: record.termCount,
    official: record.officialAlignment || "unknown",
    x: record.xTranslationCheck || "unknown",
    next: nextAction(record)
  }));

  const columns = [
    ["locale", 8],
    ["language", 22],
    ["status", 20],
    ["terms", 7],
    ["official", 10],
    ["x", 10],
    ["next", 0]
  ];

  const header = columns.map(([key, width]) => (width ? key.padEnd(width) : key)).join("  ");
  console.log(header);
  console.log(columns.map(([, width]) => "-".repeat(width || 42)).join("  "));
  for (const row of rows) {
    console.log(
      columns
        .map(([key, width]) => {
          const value = String(row[key]);
          return width ? value.padEnd(width) : value;
        })
        .join("  ")
    );
  }

  const draftCount = rows.filter((row) => row.status === "llm-drafted").length;
  const reviewedCount = rows.filter((row) => row.status === "reviewed").length;
  console.log("");
  console.log(
    `summary: ${rows.length} packs, ${reviewedCount} reviewed, ${draftCount} llm-drafted, ${rows.length - reviewedCount - draftCount} in review`
  );
}

if (require.main === module) {
  printStatus();
}

module.exports = {
  nextAction,
  printStatus
};
