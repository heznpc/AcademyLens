# Testing

AcademyLens now uses unit tests, file/syntax checks, lint/format checks, and Playwright extension E2E.

## Commands

```bash
npm test
npm run test:unit
npm run test:contracts
npm run test:coverage
npm run node-check
npm run lint
npm run format:check
npm run check:manifest
npm run check:glossary
npm run check:glossary-status
npm run check:files
npm run check:operations
npm run test:e2e
npm run qa:optional-permission
npm run build:zip
npm run check:full
npm run qa:live-extension -- --engine device
npm run release:preflight
```

`test:unit` executes behavioral Node tests. `test:contracts` executes static architecture,
manifest, policy, and workflow assertions; those checks are intentionally not counted as
unit tests. `test:coverage` reports only loaded files under `src/` and enforces line,
branch, and function thresholds for that measured module set. Browser entrypoints loaded
through extension, VM, or page contexts are verified by E2E and are not represented as a
repository-wide coverage percentage.

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
- MV3 service worker termination/restart with settings and cache preservation
- fail-closed remote requests before and after a service worker restart
- logged-in-style study-room translation while leaving Gradual platform controls untouched
- desktop and mobile viewport geometry smoke with a non-empty screenshot sanity check

## Fixture Capture

Use the capture command when a logged-in Academy page is available in a Playwright profile:

```bash
npm run capture:academy -- --url https://academy.openai.com/pages/courses --out /tmp/academylens-captured-page.html --headed
```

The capture script strips scripts, media sources, common auth attributes, account/profile containers, form values, emails, phone-like values, UUIDs, and long mixed account identifiers before writing HTML.
It prints a redaction report and refuses to write under `tests/fixtures` unless `--allow-fixture-write` is passed after manual review.

The required live QA surface list is tracked in `docs/LIVE_QA_MANIFEST.json`.

## Manual QA

For a real Academy-host injection, translation, and restore probe, run:

```bash
npm run qa:live-extension -- --engine device
```

The command loads the repository itself as an unpacked extension, rejects unexpected redirects,
checks the live Academy course-listing DOM contract, and writes no page capture. It disables
auto-translate, translates and restores both a cache-unique non-sensitive sentinel and at least
one existing Academy text candidate, then removes its temporary markers. Browser-managed native
model downloads remain off by default; on a fresh profile, pass `--allow-native-downloads`
explicitly when Chrome reports that the selected on-device language pair must be downloaded.
Use `--engine remote` only when you can approve the optional-host permission prompt in the opened
QA window. A reusable signed-in profile can be supplied with `--profile`; repository-internal
profile paths are rejected.

Chrome's optional-host permission confirmation is browser chrome, outside Playwright's page
automation surface. The default E2E suite verifies the permission declaration, initial absence,
and fail-closed behavior. Verify the positive learner-approved boundary with:

```bash
npm run qa:optional-permission
```

The script opens a fresh unpacked-extension profile, selects Google Translate, waits for the
tester to approve Chrome's native prompt, and then asserts both the granted origin and saved
engine. The prompt approval is the only manual step.

1. Load the repo as an unpacked Chrome extension.
2. Open `https://academy.openai.com/pages/courses`.
3. Click Translate.
4. Confirm course descriptions translate while the top navigation remains untouched.
5. Click Restore.
6. Navigate between course/listing pages and confirm lazy-rendered text does not duplicate translations.

## Known Gaps

- The automated suite now has a logged-in-style Gradual study-room fixture, but a live user-specific lesson fixture still needs to be captured when Chrome allows DOM capture from the logged-in profile.
- Visual coverage is geometry and non-empty screenshot smoke validation, not pixel-baseline regression.
- AI-assisted terminology review has a disabled local bridge skeleton only; no runtime GPT/Puter review is enabled.
