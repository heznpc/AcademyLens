<div align="center">

<img src="assets/icons/icon128.png" alt="AcademyLens" width="88" />

# AcademyLens

[![CI](https://github.com/heznpc/AcademyLens/actions/workflows/ci.yml/badge.svg)](https://github.com/heznpc/AcademyLens/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![GitHub contributors](https://img.shields.io/github/contributors/heznpc/AcademyLens)](https://github.com/heznpc/AcademyLens/graphs/contributors)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Read English AI courses in your language without wrecking the technical terms.**

AcademyLens is an unofficial Chrome extension for learners using OpenAI Academy. It focuses on course text translation and multilingual OpenAI/AI terminology glossaries.

Store name: **AcademyLens — AI Course Translator (Unofficial)**. The name deliberately carries no third-party trademark; the supported site is named in the description instead.

**Unofficial, not affiliated with OpenAI.**

[Install Locally](#installation) · [Contribute](CONTRIBUTING.md) · [Report Bug](https://github.com/heznpc/AcademyLens/issues/new?template=bug_report.yml) · [Improve Glossary](https://github.com/heznpc/AcademyLens/issues/new?template=glossary_submission.yml)

</div>

---

> **Beta status:** local install only, unofficial, on-device translation by default with an opt-in Google Translate engine, and not Chrome Web Store-ready until live logged-in Academy QA, glossary review evidence, provider/privacy review, and release assets are closed.

## Translation Engines

You pick the engine. The default sends nothing off your device.

| Engine                           | Course text                                                            | Needs permission |
| -------------------------------- | ---------------------------------------------------------------------- | ---------------- |
| On-device only (default)         | Translated by Chrome on your device. Never leaves your computer.       | No               |
| On-device, then Google Translate | On-device first; only untranslatable text goes to Google Translate.    | Yes              |
| Google Translate                 | Sent to Google Translate. Covers older Chrome and more language pairs. | Yes              |

`translate.googleapis.com` is an **optional** host permission, so a fresh install cannot reach it. AcademyLens requests it only when you select an engine that needs it, and the service worker re-checks the grant before every remote request. Declining reverts you to the on-device engine.

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
- [Operations](#operations)
- [Open Source](#open-source)
- [Privacy](#privacy)
- [License](#license)

## Current Scope

- Runs only on `https://academy.openai.com/*`.
- Translates visible course content into the selected language.
- Preserves core OpenAI and AI terminology such as OpenAI, ChatGPT, GPT, LLM, API, Responses API, Agents SDK, JSON, and Gradual.
- Applies installed premium glossaries built from OpenAI Academy course language and OpenAI documentation terminology before machine translation.
- Uses native language names in the language picker.
- Shows whether the selected language has a final/native-reviewed, community-reviewed, AI-audited beta, AI-drafted beta, or protected-term machine translation status.
- Uses browser-native Translator when available; browser language-pack downloads require explicit opt-in, and Google Translate remains the fallback runtime.
- Stores optional local correction overrides so a learner can fix repeated awkward translations on their own device.
- Keeps translation cache entries scoped by provider and glossary state; local corrections bypass cached provider text and are applied directly.
- Includes local-only correction management and diagnostics for provider, cache, fallback, context grouping, and embedded-frame applied/failed counts.
- Guards against late translation responses after Restore, language switches, and Gradual/Next.js route changes.
- Does not modify enrollment, progress tracking, certificates, account state, or Gradual platform data.
- Does not load remote AI scripts.

AcademyLens now ships thirteen premium glossary packs for `de`, `es`, `fr`, `hi`, `id`, `it`, `ja`, `ko`, `pt-BR`, `ru`, `vi`, `zh-CN`, and `zh-TW`, with 100+ OpenAI Academy/OpenAI Docs core terms in each pack. Korean is the first community-reviewed pack; the other premium packs are AI-audited beta glossaries with a recorded second-pass high-risk terminology audit and a quality gate for smoke terms, local-script coverage, and audit metadata. They are still waiting for X translation cross-checks, community review, and native review. Hindi and French are prioritized because OpenAI Academy already exposes India/Hindi content and French Academy events. Languages outside the premium set still use machine translation plus protected-term preservation. See [docs/TERMINOLOGY_MAP.md](docs/TERMINOLOGY_MAP.md), [docs/GLOSSARY_CONTRIBUTING.md](docs/GLOSSARY_CONTRIBUTING.md), and [docs/QUALITY_ROADMAP.md](docs/QUALITY_ROADMAP.md).

## Installation

Manual install for Chrome or another Chromium browser:

```bash
git clone https://github.com/heznpc/AcademyLens.git
cd AcademyLens
npm install
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
- No AcademyLens server; optional local Ollama integration
- Content script for OpenAI Academy DOM translation
- Background service worker for translation requests and cache

The current build lets the learner choose browser-native Translator, browser-native with an opt-in Google Translate fallback, Google Translate, or a local Ollama model. Ollama uses `http://localhost:11434/v1/chat/completions`, requires an explicit localhost permission, and never falls through to Google Translate. Chrome Web Store submission is blocked until the final provider/privacy posture is reviewed. Browser-native Translator APIs are not treated as universally available because support depends on browser, version, language availability, and page context. See [docs/TECH_STACK_REVIEW.md](docs/TECH_STACK_REVIEW.md).

OpenAI Academy is hosted through Gradual for course enrollment, progress tracking, and course-completion certificates. AcademyLens intentionally stays outside those flows and works only with visible page text.

## Built For Academy Pages

AcademyLens is designed around OpenAI Academy course-page patterns and tested against sanitized Gradual-style course, study-room, and synthetic lesson DOM structures. It translates visible lesson content while avoiding navigation, progress, certificates, quizzes, and account controls. Live logged-in Academy QA remains required before store submission.

## Quality And Release Readiness

AcademyLens is an open-source beta. It should not be treated as Chrome Web Store-ready until live Academy DOM QA, glossary review evidence, provider/privacy review, and release assets are all closed. See [docs/QUALITY_ROADMAP.md](docs/QUALITY_ROADMAP.md), [docs/TRUST_EVIDENCE.md](docs/TRUST_EVIDENCE.md), [docs/TECH_STACK_REVIEW.md](docs/TECH_STACK_REVIEW.md), and [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

## Planned v1.1

An optional AI tutor, **off by default**, with two interchangeable engines and no change to the core:

- **Cloud engine** — a locally bundled Puter.js bridge (no remotely-hosted code) that runs a stronger remote model. Requires a free Puter sign-in and sends your question plus the relevant lesson text for that request.
- **On-device engine** — Chrome's built-in Gemini Nano (Prompt API), which needs no account and keeps everything on the device, where hardware and region allow.

The tutor is additive. Translation, protected AI terminology, local corrections, and glossary term reference keep working with no account and no AI engine, so learners who can run neither engine still get the full baseline. Tutor answers are grounded in the curated glossary and the current lesson, and never surface quiz answers.

## Development

### Local Ollama translation

AcademyLens exposes these locally installed models in the engine picker: `gemma3:4b`, `qwen3.5:4b`, `qwen3.5:9b`, `aya-expanse:8b`, `qwen2.5-coder:7b`, and `gemma4:12b`. Start the server with the external model store and extension origin enabled:

```bash
OLLAMA_MODELS=/path/to/ollama/models OLLAMA_ORIGINS='chrome-extension://*' OLLAMA_CONTEXT_LENGTH=4096 OLLAMA_MAX_LOADED_MODELS=1 OLLAMA_NUM_PARALLEL=1 OLLAMA_KEEP_ALIVE=0 ollama serve
```

The popup checks whether Ollama is reachable and whether the selected model is installed. Run the real OpenAI-compatible evaluation corpus for all selectable models before a local-provider release:

```bash
npm run test:ollama
```

Add `-- --out=/tmp/academylens-ollama-results.json` to retain the per-case quality, protected-placeholder, terminology, and latency report. The `qwen3.5` requests set `reasoning_effort: "none"` because page-translation turns request short, deterministic output. Runtime batches recover structurally malformed output by splitting only the affected batch, retry a quality-failed item once, and propagate restore/language-switch cancellation to the active local request.

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
npm run release:preflight
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
npm run check:operations
npm run test:e2e
npm run build:zip
npm run store:screenshots
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
npm run glossary:scoreboard
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
The capture helper prints a redaction report and blocks fixture writes when residual sensitive patterns remain.

Generate local store screenshot drafts from the sanitized Academy-style fixture:

```bash
npm run store:screenshots
```

The screenshots are written to `dist/store-screenshots/`, which is intentionally ignored.
The optional screenshot `--path` must be one of the fixture routes with explicit Translate/Restore assertions.
These screenshots are review drafts, not final store assets.

## Operations

Operational release work is tracked in [docs/OPERATIONS.md](docs/OPERATIONS.md). The live Academy QA surface manifest is [docs/LIVE_QA_MANIFEST.json](docs/LIVE_QA_MANIFEST.json), and the generated glossary status board is [docs/GLOSSARY_STATUS.md](docs/GLOSSARY_STATUS.md).

Before any public release or store asset pass:

```bash
npm run release:preflight
```

## Open Source

AcademyLens is MIT licensed and welcomes focused contributions.

Good first contribution paths:

- glossary corrections for `src/data/glossary.<locale>.json`
- native-language review for AI-audited glossary packs
- sanitized OpenAI Academy / Gradual fixture improvements
- UI/accessibility QA reports
- tests for translation, restore, cache, SPA navigation, or glossary behavior

Start with [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/GLOSSARY_CONTRIBUTING.md](docs/GLOSSARY_CONTRIBUTING.md). Please keep every contribution clear that AcademyLens is unofficial and not affiliated with OpenAI.

## Privacy

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

## License

AcademyLens is released under the [MIT License](LICENSE).

## Acknowledgements

Development uses AI coding assistance. AcademyLens remains unofficial and not affiliated with OpenAI.
