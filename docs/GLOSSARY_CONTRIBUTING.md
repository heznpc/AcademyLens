# Glossary Contributions

AcademyLens is designed for multilingual glossary packs.

The extension can translate every supported target language through machine translation and protected-term preservation. A language becomes glossary-backed when a reviewed `src/data/glossary.<locale>.json` file is registered in `src/data/glossary.index.json`.

## Current Packs

| Locale | Status   | File                        | Notes                     |
| ------ | -------- | --------------------------- | ------------------------- |
| `ko`   | reviewed | `src/data/glossary.ko.json` | First quality-bar example |

## Contribution Model

1. Pick a target language from `SUPPORTED_LANGUAGES` in `src/lib/constants.js`.
2. Create `src/data/glossary.<locale>.json`.
3. Register it in `src/data/glossary.index.json`.
4. Run `npm run check:glossary`.
5. Add or update tests when the pack changes translation behavior.
6. Keep the pack unofficial and source-backed.

AI-generated draft glossaries are welcome as a starting point, but reviewed packs should not be raw model output. A reviewed pack needs human review, official-source mapping, and passing checks.

## Required Shape

Each glossary file should include:

- `locale`: target language code.
- `name`: human-readable pack name.
- `sourceCatalog`: official Academy/OpenAI docs sources used by the pack.
- `protectedTerms`: product, API, SDK, and platform terms that should remain unchanged.
- `terms`: English source phrases mapped to target-language terms.

Each term must include:

- `source`: English phrase from Academy/docs.
- `target`: target-language rendering.
- `category`: shared category such as `prompting`, `agents`, `evaluation`, or `workflow`.
- `sources`: IDs from `sourceCatalog`.
- `note`: short explanation of the translation choice.

## Reviewed Pack Bar

A `reviewed` glossary pack must have:

- At least 45 terms.
- Academy source coverage.
- OpenAI documentation source coverage.
- The required core categories from `scripts/check-glossary.js`.
- No duplicate source phrases.
- No collision with protected terms.
- Notes that explain the choice, not just repeat the target word.

Use `draft` status for early community packs that need review.

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
3. Review the draft with a native speaker or domain reviewer.
4. Preserve official product/API names exactly.
5. Run `npm run check:glossary`.
6. Add an E2E or unit fixture if the pack changes expected placeholder behavior.

The useful contribution is not just translation. It is consistent terminology across lessons, docs concepts, and OpenAI product names.
