# Glossary Contributions

AcademyLens is designed for multilingual glossary packs.

The extension can translate every supported target language through machine translation and protected-term preservation. A language becomes glossary-backed when `src/data/glossary.<locale>.json` is registered in `src/data/glossary.index.json`.

## Current Packs

The generated source of truth is [GLOSSARY_STATUS.md](GLOSSARY_STATUS.md). Update it with:

```bash
npm run glossary:scoreboard
```

Do not hand-edit the status board. Change `src/data/glossary.index.json` and the relevant `src/data/glossary.<locale>.json` metadata first.

## Contribution Model

1. Pick a target language from `SUPPORTED_LANGUAGES` in `src/lib/constants.js`.
2. Create `src/data/glossary.<locale>.json`.
3. Register it in `src/data/glossary.index.json`.
4. Run `npm run check:glossary`.
5. Add or update tests when the pack changes translation behavior.
6. Keep the pack unofficial and source-backed.

AI-generated draft glossaries are welcome as a starting point, but reviewed packs should not be raw model output. A reviewed pack needs human review, official-source mapping, X translation cross-check notes where useful, and passing checks.

## Required Shape

Each glossary file should include:

- `locale`: target language code.
- `name`: human-readable pack name.
- `sourceCatalog`: official Academy/OpenAI docs sources used by the pack.
- `protectedTerms`: product, API, SDK, and platform terms that should remain unchanged.
- `terms`: English source phrases mapped to target-language terms.
- `qaSignals`: draft/review status for official alignment, Google Translate baseline, X translation cross-check, and community review.

Each term must include:

- `source`: English phrase from Academy/docs.
- `target`: target-language rendering.
- `category`: shared category such as `prompting`, `agents`, `evaluation`, or `workflow`.
- `sources`: IDs from `sourceCatalog`.
- `note`: short explanation of the translation choice.

## Status Ladder

- `llm-drafted`: AI-assisted first pass. It can ship as beta correction data, but should be clearly disclosed.
- `llm-audited`: AI draft has received a focused second-pass audit against source docs and likely machine-translation failures, with `npm run check:glossary-quality` enforcing the recorded audit signal and high-risk smoke terms.
- `community-reviewed`: A fluent community reviewer has checked the language values.
- `native-reviewed`: A native speaker has checked the language values and register.
- `reviewed`: Project-maintainer-approved pack that has complete review evidence and tests. This is stricter than `community-reviewed`.

## Reviewed Pack Bar

A `reviewed` glossary pack must have:

- At least 100 core OpenAI Academy/OpenAI Docs terms.
- Academy source coverage.
- OpenAI documentation source coverage.
- The required core categories from `scripts/check-glossary.js`.
- No duplicate source phrases.
- No collision with protected terms.
- Notes that explain the choice, not just repeat the target word.
- Closed `qaSignals.xTranslationCheck` and `qaSignals.communityReview`.
- Registry `officialAlignment` marked `complete`.

Use `llm-drafted` status for early community packs that need review. Use `llm-audited` only after high-risk terminology corrections are represented in the pack metadata and `npm run check:glossary-quality` passes.

## Status Dashboard

Print the current status, next review step, and term count for every registered pack:

```bash
npm run glossary:status
```

Use the output when opening glossary issues or picking a review target. A pack should not be promoted just because it has the same source-key count as the other packs.

## X Translation Cross-Check

Public product and documentation posts often discuss new OpenAI features on X, and X provides built-in post translation. AcademyLens can use that as a practical cross-check signal:

- Use public posts only.
- Keep short notes about terminology behavior, not copied post text.
- Treat X translation as a real-world machine-translation signal, not an official OpenAI translation source.
- Do not include personal names in glossary evidence notes.
- Do not scrape X or automate around account restrictions for glossary evidence.
- Prefer link-backed manual observations such as "X commonly renders `structured outputs` this way, but official alignment remains unavailable."

## Official Source Anchors

Use public official sources only:

- `https://academy.openai.com/`
- `https://academy.openai.com/pages/courses`
- `https://developers.openai.com/api/docs`
- `https://developers.openai.com/cookbook`
- `https://developers.openai.com/learn`
- `https://platform.openai.com/docs` when it redirects to OpenAI developer docs

AcademyLens is unofficial and not affiliated with OpenAI. Glossary sources are references, not endorsement.

## AI Draft Workflow

A practical draft workflow:

1. Collect English terms from Academy course pages and official OpenAI docs.
2. Ask an AI model to propose target-language terminology with short rationale.
3. Compare likely failure cases against Google Translate.
4. Cross-check selected terms against public X translations where useful.
5. Review the draft with a native speaker or domain reviewer.
6. Preserve official product/API names exactly.
7. Run `npm run check:glossary`.
8. Add an E2E or unit fixture if the pack changes expected placeholder behavior.
9. Run `npm run glossary:audit -- --locale=<locale>` and attach the relevant review notes to the PR.

Regenerate the current premium draft packs from the maintained seed:

```bash
npm run glossary:seed
```

Before requesting review:

```bash
npm run check:glossary-overreach
npm run glossary:audit -- --locale=ko
```

For public machine-translation evidence from X, follow [X_TRANSLATION_CHECK.md](X_TRANSLATION_CHECK.md). X output is a signal, not an official source.

The useful contribution is not just translation. It is consistent terminology across lessons, docs concepts, and OpenAI product names.
