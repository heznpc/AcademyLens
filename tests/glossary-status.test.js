const assert = require("node:assert/strict");
const test = require("node:test");

const GlossaryStatus = require("../scripts/glossary-status.js");

test("glossary status markdown is generated from registry rows", () => {
  const index = {
    glossaries: [
      {
        locale: "ko",
        language: "Korean",
        status: "community-reviewed",
        termCount: 115,
        officialAlignment: "partial",
        xTranslationCheck: "pending"
      },
      {
        locale: "es",
        language: "Spanish",
        status: "llm-drafted",
        termCount: 115,
        officialAlignment: "partial",
        xTranslationCheck: "pending"
      }
    ]
  };

  const markdown = GlossaryStatus.formatMarkdown(index);

  assert.match(markdown, /^# Glossary Status/);
  assert.match(markdown, /Summary: 2 premium packs, 230 terms, 0 reviewed, 1 AI-drafted beta packs, 1 in review\./);
  assert.match(markdown, /## ko - Korean/);
  assert.match(markdown, /Status: `community-reviewed`/);
  assert.match(markdown, /Next action: complete X check and native review/);
  assert.match(markdown, /## es - Spanish/);
  assert.match(markdown, /Status: `llm-drafted`/);
  assert.match(markdown, /Next action: audit high-risk terms, then request community\/native review/);
  assert(!/\d{4}-\d{2}-\d{2}/.test(markdown));
});

test("glossary status console summary counts review states", () => {
  const rows = [
    {
      locale: "ko",
      language: "Korean",
      status: "community-reviewed",
      terms: 115,
      official: "partial",
      x: "pending",
      next: "next"
    },
    {
      locale: "de",
      language: "German",
      status: "llm-drafted",
      terms: 115,
      official: "partial",
      x: "pending",
      next: "next"
    },
    {
      locale: "ja",
      language: "Japanese",
      status: "reviewed",
      terms: 115,
      official: "complete",
      x: "complete",
      next: "next"
    }
  ];

  assert.deepEqual(GlossaryStatus.summaryFromRows(rows), {
    draftCount: 1,
    reviewedCount: 1,
    inReviewCount: 1,
    totalPacks: 3,
    totalTerms: 345
  });
  assert.match(GlossaryStatus.formatConsole(rows), /summary: 3 packs, 1 reviewed, 1 llm-drafted, 1 in review/);
});
