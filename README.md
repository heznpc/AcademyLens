# AcademyLens

Translate OpenAI Academy course content in your language with protected AI terminology.

AcademyLens is an unofficial Chrome extension for learners using OpenAI Academy. It focuses on course text translation and protected AI terminology.

**Unofficial, not affiliated with OpenAI.**

## Current Scope

- Runs only on `https://academy.openai.com/*`.
- Translates visible course content into the selected language.
- Preserves core OpenAI and AI terminology such as OpenAI, ChatGPT, GPT, LLM, API, and Gradual.
- Applies the Korean glossary to known AI terms before machine translation.
- Uses native language names in the language picker.
- Shows whether the selected language has glossary-backed correction or machine translation only.
- Uses Google Translate for fast page translation.
- Guards against late translation responses after Restore, language switches, and Gradual/Next.js route changes.
- Does not modify enrollment, progress tracking, certificates, account state, or Gradual platform data.
- Does not load remote AI scripts.

Korean is the first glossary-backed target language. Other target languages currently use machine translation plus protected-term preservation only.

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
npm run check:files
npm run test:e2e
npm run build:zip
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
