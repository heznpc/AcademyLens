const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { join, relative } = require("node:path");
const { PREMIUM_LOCALE_RECORDS, PROTECTED_TERMS, QUALITY_SMOKE_TERMS } = require("./lib/glossary-config.js");

const ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(ROOT, "dist", "glossary-audit-packets");
const ZIP_PATH = join(ROOT, "dist", "academy-lens-glossary-audit-packets.zip");
const OFFICIAL_SOURCE_ANCHORS = [
  "https://academy.openai.com/",
  "https://academy.openai.com/pages/courses",
  "https://developers.openai.com/",
  "https://developers.openai.com/api/docs",
  "https://developers.openai.com/cookbook",
  "https://developers.openai.com/learn",
  "https://platform.openai.com/docs when it redirects to OpenAI developer docs"
];

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

function writeText(path, text) {
  writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`);
}

function codeBlock(language, value) {
  const content = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return `\`\`\`${language}\n${content}\n\`\`\``;
}

function buildPrompt(record, glossary, index, koreanReference) {
  const smokeTerms = QUALITY_SMOKE_TERMS[record.locale] || {};
  const localePath = `src/data/glossary.${record.locale}.json`;
  const recommendedStatus = record.locale === "ko" ? "reviewed" : "llm-audited";

  return `# AcademyLens Glossary Audit Packet: ${record.locale}

You are auditing a multilingual premium glossary for AcademyLens, an unofficial browser extension for OpenAI Academy course translation.

## Context

- AcademyLens is unofficial and not affiliated with OpenAI.
- The glossary improves machine-translated OpenAI Academy and OpenAI developer-learning content.
- This is terminology normalization for AI education content, not generic UI translation.
- Target readers are learners, builders, and developers studying OpenAI Academy courses in their own language.
- Preserve protected product, platform, and API names exactly.

## Target

- Locale: \`${record.locale}\`
- Language: ${record.language}
- Current status: \`${record.status}\`
- Glossary file: \`${localePath}\`
- Recommended post-audit status if the audit is credible: \`${recommendedStatus}\`

## Protected Terms

${PROTECTED_TERMS.map((term) => `- ${term}`).join("\n")}

## Official Source Anchors

Use these as public reference anchors. They are references, not endorsement.

${OFFICIAL_SOURCE_ANCHORS.map((source) => `- ${source}`).join("\n")}

## Audit Goals

Review the target-language glossary terms for:

1. Technical correctness in OpenAI, AI, and developer education context.
2. Naturalness for fluent readers of ${record.language}.
3. Consistency across singular/plural pairs.
4. Consistency across related terms such as prompt/prompting, eval/evals, agent/agents, tool/tool call, schema/structured outputs.
5. False friends, awkward literal translations, wrong accents, wrong region, or non-native phrasing.
6. Whether terms should remain English because local AI/developer communities commonly use the English term.
7. Whether product/API/platform names are accidentally translated.
8. Whether the current note still matches the revised target term.

## Do Not

- Do not rewrite protected terms.
- Do not invent marketing language.
- Do not translate source keys.
- Do not change categories unless the category is clearly wrong.
- Do not mark the pack as human/native reviewed.
- Do not return prose-only feedback.

## Required Output

Return only valid JSON with this exact shape:

${codeBlock("json", {
  locale: record.locale,
  recommendedStatus,
  overallAssessment: "short assessment in English",
  riskLevel: "low|medium|high",
  patches: [
    {
      source: "exact English source phrase from the glossary",
      currentTarget: "current target value",
      recommendedTarget: "new target value",
      severity: "blocker|major|minor|style",
      reason: "brief reason",
      confidence: "low|medium|high"
    }
  ],
  keepAsIs: [
    {
      source: "exact English source phrase",
      target: "target value",
      reason: "brief reason"
    }
  ],
  needsHumanReview: [
    {
      source: "exact English source phrase",
      target: "target value",
      reason: "why a native/domain reviewer should decide"
    }
  ],
  smokeTermsToAdd: [
    {
      source: "important source phrase",
      expectedTarget: "recommended stable target",
      reason: "why this should become an automated smoke check"
    }
  ]
})}

Severity guidance:

- \`blocker\`: wrong meaning, product/API name mistranslated, or likely harmful confusion.
- \`major\`: unnatural or inconsistent term that would reduce trust.
- \`minor\`: acceptable but should be improved.
- \`style\`: preference only.

Be conservative. If a term is acceptable and commonly used by local AI/developer communities, keep it.

## Existing Smoke Terms For This Locale

These are currently enforced by automated checks. Recommend additions if you find better high-signal smoke terms.

${codeBlock("json", smokeTerms)}

## Glossary Under Audit

${codeBlock("json", glossary)}

## Registry Snapshot

${codeBlock("json", {
  schemaVersion: index.schemaVersion,
  premiumLocales: index.premiumLocales,
  protectedTerms: index.protectedTerms,
  qaLayers: index.qaLayers,
  targetRecord: index.glossaries.find((entry) => entry.locale === record.locale)
})}

## Korean Quality-Bar Reference

Use this as a structural quality reference only. Do not translate through Korean.

${codeBlock("json", {
  locale: koreanReference.locale,
  status: koreanReference.status,
  sampleTerms: koreanReference.terms.slice(0, 12)
})}
`;
}

function buildReadme(records) {
  return `# AcademyLens Glossary Audit Packets

Generated files for second-model or human terminology audit.

## How To Use

Upload the relevant \`audit-${records[0].locale}.md\` style packet to Claude and ask it to return only the JSON requested in the packet. Each packet already includes the prompt, target glossary JSON, registry snapshot, protected terms, current smoke terms, and Korean quality-bar sample.

The bundled zip is:

\`\`\`text
dist/academy-lens-glossary-audit-packets.zip
\`\`\`

## Recommended Review Order

${records.map((record, index) => `${index + 1}. \`${record.locale}\` - ${record.language} (${record.status})`).join("\n")}

## After Receiving Claude Output

1. Apply only JSON patch recommendations you accept.
2. Keep non-human-reviewed packs at \`llm-audited\`, not \`reviewed\`.
3. Add high-signal \`smokeTermsToAdd\` entries to \`scripts/lib/glossary-config.js\`.
4. Run:

\`\`\`bash
npm run glossary:seed
npm run check:full
\`\`\`

AcademyLens is unofficial and not affiliated with OpenAI.
`;
}

function main() {
  const index = readJson("src/data/glossary.index.json");
  const koreanReference = readJson("src/data/glossary.ko.json");

  rmSync(OUTPUT_DIR, { force: true, recursive: true });
  rmSync(ZIP_PATH, { force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const records = PREMIUM_LOCALE_RECORDS.map((record) => ({
    ...record,
    path: `src/data/glossary.${record.locale}.json`
  }));

  for (const record of records) {
    const glossary = readJson(record.path);
    writeText(join(OUTPUT_DIR, `audit-${record.locale}.md`), buildPrompt(record, glossary, index, koreanReference));
  }

  writeText(join(OUTPUT_DIR, "README.md"), buildReadme(records));
  writeText(
    join(OUTPUT_DIR, "manifest.json"),
    JSON.stringify(
      {
        generatedBy: "scripts/export-glossary-audit-packets.js",
        packetCount: records.length,
        packets: records.map((record) => ({
          locale: record.locale,
          language: record.language,
          status: record.status,
          file: `audit-${record.locale}.md`
        }))
      },
      null,
      2
    )
  );

  if (existsSync(OUTPUT_DIR)) {
    execFileSync("zip", ["-qr", ZIP_PATH, relative(ROOT, OUTPUT_DIR)], { cwd: ROOT });
  }

  console.log(`Wrote ${records.length} audit packets to ${relative(ROOT, OUTPUT_DIR)}`);
  console.log(`Wrote ${relative(ROOT, ZIP_PATH)}`);
}

main();
