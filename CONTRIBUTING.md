# Contributing to AcademyLens

Thanks for helping make OpenAI Academy course material easier to read across languages.

AcademyLens is an unofficial browser extension and is not affiliated with OpenAI. Contributions must avoid language that suggests endorsement, partnership, or affiliation with OpenAI.

## Affiliation Rules

Use `AcademyLens` as the product name. Use `AcademyLens for OpenAI Academy (Unofficial)` only when the context needs to identify the target site.

Do not use names or copy such as `OpenAI Academy Lens`, `OpenAI Translator`, `OpenAI-approved`, `powered by OpenAI`, or anything that implies OpenAI built, sponsors, endorses, or certifies the extension.

## Quick Start

```bash
git clone https://github.com/heznpc/AcademyLens.git
cd AcademyLens
npm install
npm run check:all
```

Load the extension locally:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the repo folder.
5. Open `https://academy.openai.com/`.

## Good First Contributions

- Fix a glossary term in `src/data/glossary.<locale>.json`.
- Add a high-signal smoke term in `scripts/lib/glossary-config.js`.
- Improve documentation or privacy wording.
- Improve public copy consistency without making official-affiliation claims.
- File a QA report from a real Academy course page.
- Add a sanitized Gradual fixture or a focused test case.

Look for issues labeled `good first issue`, `i18n`, `glossary`, or `qa`.

CODEOWNERS currently routes final merge authority to `@heznpc`. Outside review is still welcome through issues, PR notes, QA reports, and glossary audit packets; status promotion happens only after the review evidence is documented.

## Glossary Contributions

Glossary work is the highest-impact contribution path.

Current premium packs live in `src/data/glossary.<locale>.json` and are registered in `src/data/glossary.index.json`.

When changing glossary data:

1. Keep `source` unchanged unless adding a new term.
2. Preserve protected terms such as OpenAI, ChatGPT, GPT, API, SDK, JSON Schema, Responses API, Agents SDK, Gradual, and Google Translate.
3. Prefer terms that are natural for local AI/developer communities.
4. Add or update smoke checks for important corrected terms in `scripts/lib/glossary-config.js`.
5. Run:

```bash
npm run format
npm run check:glossary
npm run check:glossary-overreach
```

For normal glossary PRs, edit the locale JSON directly. Do not run `npm run glossary:seed` unless you are intentionally regenerating the maintained draft packs from `scripts/seed-premium-glossaries.js`.

AI-generated drafts are welcome as starting points. Do not mark a pack `reviewed` unless it has credible human/native/community review evidence. Use `llm-audited` for second-model audits and `native-reviewed` or `community-reviewed` only when that review actually happened.

See [docs/GLOSSARY_CONTRIBUTING.md](docs/GLOSSARY_CONTRIBUTING.md) for the detailed glossary model.

## Code Contributions

Before opening a PR:

```bash
npm run check:full
```

For faster iteration:

```bash
npm run node-check
npm run lint
npm run format:check
npm test
npm run check:manifest
npm run check:glossary
npm run check:files
npm run test:e2e
```

Code changes should stay aligned with the current architecture:

- Manifest V3 extension.
- Frontend-only; no AcademyLens server.
- No API key requirement.
- No remote hosted runtime code.
- Translate visible lesson/course text only.
- Do not modify OpenAI Academy enrollment, progress, certificates, quizzes, accounts, or credentials.

## Fixture And Privacy Rules

Sanitized Academy/Gradual fixtures are useful, but never commit private user data.

Use:

```bash
npm run capture:academy -- --url https://academy.openai.com/pages/courses --out /tmp/academylens-captured-page.html --headed
```

Only write under `tests/fixtures` after manual review and `--allow-fixture-write`.

Do not commit:

- emails, names, avatars, profile data, cookies, auth tokens, or form values
- live remote scripts or telemetry metadata
- screenshots containing private account/course progress details

## Pull Request Checklist

- [ ] The change keeps the unofficial/non-affiliation wording intact.
- [ ] `npm run check:full` passes, or the PR explains why it was not run.
- [ ] Glossary changes include smoke checks when appropriate.
- [ ] UI changes include screenshots or a short visual QA note.
- [ ] README, store, or icon changes avoid official-affiliation claims.
- [ ] Fixture changes are sanitized.
- [ ] Privacy/security-sensitive changes are called out clearly.

## Security

Report suspected vulnerabilities privately. See [SECURITY.md](SECURITY.md).
