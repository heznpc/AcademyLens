const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
const VALID_STATUSES = new Set(["llm-drafted", "llm-audited", "community-reviewed", "native-reviewed", "reviewed"]);

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

function evidence(value) {
  return typeof value === "string" && value.trim() && !/^(pending|none|unknown)$/i.test(value.trim());
}

function main() {
  const index = readJson("src/data/glossary.index.json");
  const failures = [];
  const summary = [];
  for (const record of index.glossaries || []) {
    const glossary = readJson(record.path);
    const signals = glossary.qaSignals || {};
    if (!VALID_STATUSES.has(record.status)) failures.push(`${record.locale}: invalid status ${record.status}`);
    if (glossary.locale !== record.locale) failures.push(`${record.locale}: pack locale mismatch`);
    if (glossary.status !== record.status) failures.push(`${record.locale}: index/pack status mismatch`);
    if (glossary.terms.length !== record.termCount) failures.push(`${record.locale}: term count mismatch`);
    if (record.status === "llm-audited" && !evidence(record.aiAudit)) {
      failures.push(`${record.locale}: llm-audited without aiAudit evidence`);
    }
    if (record.status === "community-reviewed" && !evidence(signals.communityReview)) {
      failures.push(`${record.locale}: community-reviewed without communityReview evidence`);
    }
    if (["native-reviewed", "reviewed"].includes(record.status) && !evidence(signals.nativeReview)) {
      failures.push(`${record.locale}: ${record.status} without nativeReview evidence`);
    }
    if (record.status === "reviewed" && !evidence(signals.xTranslationCheck)) {
      failures.push(`${record.locale}: reviewed without closed X translation evidence`);
    }
    summary.push({ locale: record.locale, status: record.status, terms: record.termCount });
  }
  if (failures.length) throw new Error(`Glossary review readiness failed:\n- ${failures.join("\n- ")}`);
  const finalCount = summary.filter((item) => ["native-reviewed", "reviewed"].includes(item.status)).length;
  console.log(`glossary review readiness ok: ${summary.length} packs, ${finalCount} final-review packs`);
}

main();
