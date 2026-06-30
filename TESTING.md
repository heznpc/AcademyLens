# Testing

AcademyLens now uses unit tests, file/syntax checks, lint/format checks, and Playwright extension E2E.

## Commands

```bash
npm test
npm run node-check
npm run lint
npm run format:check
npm run check:manifest
npm run check:glossary
npm run check:glossary-status
npm run check:files
npm run check:operations
npm run test:e2e
npm run build:zip
npm run check:full
npm run release:preflight
```

## Current Automated Coverage

- glossary protected-term masking and restore
- required protected terms
- text filtering heuristics
- stable cache hashing
- Google Translate response parsing and failure handling
- DOM walker exclusions for Gradual chrome, code, hidden text, and already translated Korean text
- logged-in-style study-room fixture filtering for lesson text vs. progress/certificate/quiz/account UI
- restore whitespace behavior
- installed glossary pre-translation placeholders
- plural course-term placeholders in reviewed glossary packs
- Academy/OpenAI-docs source metadata for glossary terms
- glossary source/category/duplicate/protected-term checks
- native language picker labels
- selected-language support messaging
- local cache trimming by recent access
- disabled AI review bridge guard
- generated glossary status board drift checks
- live Academy QA manifest structure
- operations checklist coverage

## Playwright E2E Coverage

The E2E suite patches a temporary extension copy to run against local Gradual-style fixtures. It stubs Google Translate at the browser-context level.

- extension load and floating panel injection
- native language labels
- Translate and Restore
- protected term preservation
- installed glossary term application
- cache hit/miss behavior
- rapid Translate -> Restore race
- rapid language switching race
- SPA navigation after translation
- logged-in-style study-room translation while leaving Gradual platform controls untouched
- desktop and mobile viewport visual smoke screenshots

## Fixture Capture

Use the capture command when a logged-in Academy page is available in a Playwright profile:

```bash
npm run capture:academy -- --url https://academy.openai.com/pages/courses --out /tmp/academylens-captured-page.html --headed
```

The capture script strips scripts, media sources, common auth attributes, account/profile containers, form values, emails, phone-like values, UUIDs, and long mixed account identifiers before writing HTML.
It prints a redaction report and refuses to write under `tests/fixtures` unless `--allow-fixture-write` is passed after manual review.

The required live QA surface list is tracked in `docs/LIVE_QA_MANIFEST.json`.

## Manual QA

1. Load the repo as an unpacked Chrome extension.
2. Open `https://academy.openai.com/pages/courses`.
3. Click Translate.
4. Confirm course descriptions translate while the top navigation remains untouched.
5. Click Restore.
6. Navigate between course/listing pages and confirm lazy-rendered text does not duplicate translations.

## Known Gaps

- The automated suite now has a logged-in-style Gradual study-room fixture, but a live user-specific lesson fixture still needs to be captured when Chrome allows DOM capture from the logged-in profile.
- Visual coverage is smoke-level viewport and screenshot validation, not pixel-baseline regression.
- AI-assisted terminology review has a disabled local bridge skeleton only; no runtime GPT/Puter review is enabled.
