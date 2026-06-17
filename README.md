# AcademyLens

Translate OpenAI Academy course content in your language with protected AI terminology.

AcademyLens is an unofficial Chrome extension for learners using OpenAI Academy. It focuses on course text translation and multilingual OpenAI/AI terminology glossaries.

**Unofficial, not affiliated with OpenAI.**

## Current Scope

- Runs only on `https://academy.openai.com/*`.
- Translates visible course content into the selected language.
- Preserves core OpenAI and AI terminology such as OpenAI, ChatGPT, GPT, LLM, API, Responses API, Agents SDK, JSON, and Gradual.
- Applies installed premium glossaries built from OpenAI Academy course language and OpenAI documentation terminology before machine translation.
- Uses native language names in the language picker.
- Shows whether the selected language has a reviewed glossary, an AI-drafted beta glossary, or machine translation with protected terms.
- Uses Google Translate for fast page translation.
- Guards against late translation responses after Restore, language switches, and Gradual/Next.js route changes.
- Does not modify enrollment, progress tracking, certificates, account state, or Gradual platform data.
- Does not load remote AI scripts.

AcademyLens now ships twelve premium glossary packs for `de`, `es`, `fr`, `id`, `it`, `ja`, `ko`, `pt-BR`, `ru`, `vi`, `zh-CN`, and `zh-TW`. Korean is the first reviewed pack; the other premium packs are AI-drafted beta glossaries waiting for X translation cross-checks, community review, and native review. Languages outside the premium set still use machine translation plus protected-term preservation. See [docs/TERMINOLOGY_MAP.md](docs/TERMINOLOGY_MAP.md) and [docs/GLOSSARY_CONTRIBUTING.md](docs/GLOSSARY_CONTRIBUTING.md).

## Why Separate From SkillBridge?

AcademyLens is a separate project because OpenAI Academy has a different product identity, site structure, risk profile, and store-listing strategy. SkillBridge remains a read-only reference for testing philosophy and release hygiene, not a source copied wholesale into this repo.

## Technical Shape

- Chrome Manifest V3
- Frontend-only extension
- No API key
- No server
- Content script for OpenAI Academy DOM translation
- Background service worker for translation requests and cache

OpenAI Academy is hosted through Gradual for course enrollment, progress tracking, and course-completion certificates. AcademyLens intentionally stays outside those flows and works only with visible page text.

## Built For Academy Pages

AcademyLens is designed around OpenAI Academy course-page patterns and tested against Gradual-style course, study-room, and lesson DOM structures. It translates visible lesson content while avoiding navigation, progress, certificates, quizzes, and account controls.

## Planned v1.1

AI-assisted terminology review may return only if it can be implemented without remote hosted code risk, such as a reviewed local bundle or another compliant opt-in bridge.

## Development

```bash
npm run check:all
npm run test:e2e
npm run build:zip
npm run check:full
```

Focused commands:

```bash
npm run node-check
npm run lint
npm run format:check
npm test
npm run check:manifest
npm run check:glossary
npm run check:files
npm run test:e2e
npm run build:zip
```

## Glossary Contributions

AcademyLens welcomes multilingual glossary packs. Add language packs under `src/data/glossary.<locale>.json`, register them in `src/data/glossary.index.json`, and run `npm run check:glossary`. AI-generated drafts are useful starting points, but reviewed packs should be source-backed and human-reviewed. See [docs/GLOSSARY_CONTRIBUTING.md](docs/GLOSSARY_CONTRIBUTING.md).

Regenerate the current twelve premium draft packs from the maintained seed:

```bash
npm run glossary:seed
```

Capture a sanitized Academy DOM fixture from a Playwright profile:

```bash
npm run capture:academy -- --url https://academy.openai.com/pages/courses --out /tmp/academylens-captured-page.html --headed
```

To intentionally save a reviewed, sanitized capture under `tests/fixtures`, pass `--allow-fixture-write`.

Load the extension:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this repo folder.
5. Open `https://academy.openai.com/`.

## Privacy

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

## Acknowledgements

Development assisted by OpenAI Codex.
