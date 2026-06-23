<div align="center">

<img src="assets/icons/icon128.png" alt="AcademyLens" width="88" />

# AcademyLens

[![CI](https://github.com/heznpc/AcademyLens/actions/workflows/ci.yml/badge.svg)](https://github.com/heznpc/AcademyLens/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![GitHub contributors](https://img.shields.io/github/contributors/heznpc/AcademyLens)](https://github.com/heznpc/AcademyLens/graphs/contributors)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Translate and review OpenAI Academy course content in your language.**

AcademyLens is an unofficial Chrome extension for learners using OpenAI Academy. It focuses on course text translation and multilingual OpenAI/AI terminology glossaries.

**Unofficial, not affiliated with OpenAI.**

[Install Locally](#installation) · [Contribute](CONTRIBUTING.md) · [Report Bug](https://github.com/heznpc/AcademyLens/issues/new?template=bug_report.yml) · [Improve Glossary](https://github.com/heznpc/AcademyLens/issues/new?template=glossary_submission.yml)

</div>

---

## Table of Contents

- [Current Scope](#current-scope)
- [Installation](#installation)
- [Why Separate From SkillBridge?](#why-separate-from-skillbridge)
- [Technical Shape](#technical-shape)
- [Built For Academy Pages](#built-for-academy-pages)
- [Quality And Release Readiness](#quality-and-release-readiness)
- [Planned v1.1](#planned-v11)
- [Development](#development)
- [Glossary Contributions](#glossary-contributions)
- [Open Source](#open-source)
- [Privacy](#privacy)
- [License](#license)

## Current Scope

- Runs only on `https://academy.openai.com/*`.
- Translates visible course content into the selected language.
- Preserves core OpenAI and AI terminology such as OpenAI, ChatGPT, GPT, LLM, API, Responses API, Agents SDK, JSON, and Gradual.
- Applies installed premium glossaries built from OpenAI Academy course language and OpenAI documentation terminology before machine translation.
- Uses native language names in the language picker.
- Shows whether the selected language has a reviewed glossary, an AI-drafted beta glossary, or machine translation with protected terms.
- Uses Google Translate for the current fast translation runtime while browser-native translation providers are evaluated.
- Guards against late translation responses after Restore, language switches, and Gradual/Next.js route changes.
- Does not modify enrollment, progress tracking, certificates, account state, or Gradual platform data.
- Does not load remote AI scripts.

AcademyLens now ships thirteen premium glossary packs for `de`, `es`, `fr`, `hi`, `id`, `it`, `ja`, `ko`, `pt-BR`, `ru`, `vi`, `zh-CN`, and `zh-TW`, with 100+ OpenAI Academy/OpenAI Docs core terms in each pack. Korean is the first community-reviewed pack; the other premium packs are AI-drafted beta glossaries waiting for X translation cross-checks, community review, and native review. Hindi and French are prioritized because OpenAI Academy already exposes India/Hindi content and French Academy events. Languages outside the premium set still use machine translation plus protected-term preservation. See [docs/TERMINOLOGY_MAP.md](docs/TERMINOLOGY_MAP.md), [docs/GLOSSARY_CONTRIBUTING.md](docs/GLOSSARY_CONTRIBUTING.md), and [docs/QUALITY_ROADMAP.md](docs/QUALITY_ROADMAP.md).

## Installation

Manual install for Chrome or another Chromium browser:

```bash
git clone https://github.com/heznpc/AcademyLens.git
cd AcademyLens
npm install
npm run check:all
```

Then:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this repo folder.
5. Open `https://academy.openai.com/`.

AcademyLens is not yet submitted to the Chrome Web Store. Store submission will wait until the product, glossary quality, privacy copy, and live Academy DOM behavior are ready.

## Why Separate From SkillBridge?

AcademyLens is a separate project because OpenAI Academy has a different product identity, site structure, risk profile, and store-listing strategy. SkillBridge remains a read-only reference for testing philosophy and release hygiene, not a source copied wholesale into this repo.

## Technical Shape

- Chrome Manifest V3
- Frontend-only extension
- No API key
- No server
- Content script for OpenAI Academy DOM translation
- Background service worker for translation requests and cache

The current build uses a Google Translate web endpoint for fast translation. Chrome Web Store submission is blocked until the final provider/privacy posture is reviewed. Browser-native Translator APIs are tracked as a future provider candidate, but not treated as a universal default yet. See [docs/TECH_STACK_REVIEW.md](docs/TECH_STACK_REVIEW.md).

OpenAI Academy is hosted through Gradual for course enrollment, progress tracking, and course-completion certificates. AcademyLens intentionally stays outside those flows and works only with visible page text.

## Built For Academy Pages

AcademyLens is designed around OpenAI Academy course-page patterns and tested against Gradual-style course, study-room, and lesson DOM structures. It translates visible lesson content while avoiding navigation, progress, certificates, quizzes, and account controls.

## Quality And Release Readiness

AcademyLens is an open-source beta. It should not be treated as Chrome Web Store-ready until live Academy DOM QA, glossary review evidence, provider/privacy review, and release assets are all closed. See [docs/QUALITY_ROADMAP.md](docs/QUALITY_ROADMAP.md), [docs/TECH_STACK_REVIEW.md](docs/TECH_STACK_REVIEW.md), and [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

## Planned v1.1

AI-assisted terminology review may return only if it can be implemented without remote hosted code risk, such as a reviewed local bundle or another compliant opt-in bridge.

## Development

Install dependencies once:

```bash
npm install
```

Full local verification:

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

The strict all-in-one gate is:

```bash
npm run check:full
```

## Glossary Contributions

AcademyLens welcomes multilingual glossary packs. Add language packs under `src/data/glossary.<locale>.json`, register them in `src/data/glossary.index.json`, and run `npm run check:glossary`. AI-generated drafts are useful starting points, but reviewed packs should be source-backed and human-reviewed. See [docs/GLOSSARY_CONTRIBUTING.md](docs/GLOSSARY_CONTRIBUTING.md).

Regenerate the current premium draft packs from the maintained seed:

```bash
npm run glossary:seed
```

Check current glossary review status:

```bash
npm run glossary:status
```

Generate reviewer packets and run over-translation smoke checks:

```bash
npm run glossary:audit
npm run check:glossary-overreach
```

See [docs/GLOSSARY_AUDIT.md](docs/GLOSSARY_AUDIT.md) and [docs/X_TRANSLATION_CHECK.md](docs/X_TRANSLATION_CHECK.md).

Capture a sanitized Academy DOM fixture from a Playwright profile:

```bash
npm run capture:academy -- --url https://academy.openai.com/pages/courses --out /tmp/academylens-captured-page.html --headed
```

To intentionally save a reviewed, sanitized capture under `tests/fixtures`, pass `--allow-fixture-write`.

## Open Source

AcademyLens is MIT licensed and welcomes focused contributions.

Good first contribution paths:

- glossary corrections for `src/data/glossary.<locale>.json`
- native-language review for AI-drafted glossary packs
- sanitized OpenAI Academy / Gradual fixture improvements
- UI/accessibility QA reports
- tests for translation, restore, cache, SPA navigation, or glossary behavior

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Please keep every contribution clear that AcademyLens is unofficial and not affiliated with OpenAI.

## Privacy

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

## License

AcademyLens is released under the [MIT License](LICENSE).

## Acknowledgements

Development assisted by OpenAI Codex.
