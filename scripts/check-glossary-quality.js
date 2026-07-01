const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { QUALITY_SMOKE_TERMS } = require("./lib/glossary-config.js");

const ROOT = join(__dirname, "..");
const AI_AUDIT_ID = "codex-ai-audit-2026-07-01-high-risk-terms";
const MIN_AUDITED_SMOKE_TERMS = 8;

const NON_LATIN_SCRIPT_RULES = Object.freeze({
  hi: Object.freeze({ label: "Devanagari", pattern: /[\u0900-\u097f]/, minCoverage: 0.95 }),
  ja: Object.freeze({ label: "Japanese", pattern: /[\u3040-\u30ff\u3400-\u9fff]/, minCoverage: 0.95 }),
  ko: Object.freeze({ label: "Hangul", pattern: /[\uac00-\ud7af]/, minCoverage: 0.95 }),
  ru: Object.freeze({ label: "Cyrillic", pattern: /[\u0400-\u04ff]/, minCoverage: 0.95 }),
  "zh-CN": Object.freeze({ label: "Simplified Chinese", pattern: /[\u3400-\u9fff]/, minCoverage: 0.98 }),
  "zh-TW": Object.freeze({ label: "Traditional Chinese", pattern: /[\u3400-\u9fff]/, minCoverage: 0.98 })
});

const LOCAL_SCRIPT_EXCEPTIONS = Object.freeze({
  ru: Object.freeze(new Set(["eval", "evals"]))
});

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalized(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function termsBySource(pack) {
  return new Map(pack.terms.map((term) => [normalized(term.source), term]));
}

function assertSmokeTerms(locale, pack) {
  const smokeTerms = QUALITY_SMOKE_TERMS[locale] || {};
  const bySource = termsBySource(pack);
  for (const [source, expectedTarget] of Object.entries(smokeTerms)) {
    const term = bySource.get(normalized(source));
    assert(term, `${locale} missing quality smoke term: ${source}`);
    assert(
      term.target === expectedTarget,
      `${locale} quality smoke mismatch for "${source}": expected "${expectedTarget}", got "${term.target}"`
    );
  }
}

function assertAuditedSignals(record, pack) {
  if (record.status !== "llm-audited") return;
  const smokeCount = Object.keys(QUALITY_SMOKE_TERMS[record.locale] || {}).length;
  assert(smokeCount >= MIN_AUDITED_SMOKE_TERMS, `${record.locale} llm-audited pack needs wider smoke coverage`);
  assert(record.aiAudit === AI_AUDIT_ID, `${record.locale} registry missing current AI audit id`);
  assert(
    pack.qaSignals && pack.qaSignals.llmAudit === AI_AUDIT_ID,
    `${record.locale} pack missing current AI audit id`
  );
  assert(
    pack.qaSignals.googleTranslateBaseline === "high-risk-terms-audited",
    `${record.locale} pack should record high-risk Google baseline audit`
  );
  assert(
    pack.qaSignals.communityReview === "open",
    `${record.locale} AI-audited pack must not imply closed community review`
  );
}

function assertLocalScriptCoverage(record, pack) {
  const rule = NON_LATIN_SCRIPT_RULES[record.locale];
  if (!rule) return;

  const exceptions = LOCAL_SCRIPT_EXCEPTIONS[record.locale] || new Set();
  const misses = [];
  let total = 0;
  let covered = 0;

  for (const term of pack.terms) {
    if (exceptions.has(term.source)) continue;
    total += 1;
    if (rule.pattern.test(term.target)) {
      covered += 1;
    } else {
      misses.push(`${term.source} -> ${term.target}`);
    }
  }

  const coverage = covered / Math.max(1, total);
  assert(
    coverage >= rule.minCoverage,
    `${record.locale} ${rule.label} target coverage too low: ${covered}/${total}; misses: ${misses.slice(0, 12).join(", ")}`
  );
}

function main() {
  const index = readJson("src/data/glossary.index.json");
  let auditedCount = 0;

  for (const record of index.glossaries) {
    const pack = readJson(record.path);
    assertSmokeTerms(record.locale, pack);
    assertAuditedSignals(record, pack);
    assertLocalScriptCoverage(record, pack);
    if (record.status === "llm-audited") auditedCount += 1;
  }

  console.log(`glossary quality ok (${auditedCount} AI-audited packs)`);
}

main();
