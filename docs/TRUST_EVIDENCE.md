# Trust Evidence

Last revised: 2026-10-13 KST (new provider/reading paths are runtime-unverified)

AcademyLens is an open-source beta for OpenAI Academy learners.

**Unofficial, not affiliated with OpenAI.**

This page collects release evidence that should stay easy to inspect before any public store submission or promotional release.

## Runtime Scope

- Runs only on `https://academy.openai.com/*`.
- Translates extension-selected visible course or lesson text.
- Avoids Gradual platform chrome such as enrollment, progress, certificates, quizzes, account controls, forms, navigation, cookie prompts, and status surfaces.
- Does not change enrollment, course progress, certificates, account state, or OpenAI Academy settings.
- Does not run an AcademyLens server or load remote AI scripts. The default engine needs no key; optional API and Puter connections use user-supplied session credentials.
- Offers immediate original-text inspection and requested notes in a separate reading panel.

## Provider And Privacy Evidence

- Browser-native Translator API is used only when the learner selects the on-device engine.
- Browser-managed translator downloads remain disabled unless the user explicitly enables them.
- Google Translate through `translate.googleapis.com` is an independently selected engine and requires its optional host permission.
- Local Ollama is an independently selected engine and requires its optional localhost permission.
- Puter and user-configured HTTPS APIs require the selected origin's permission. Tokens/keys are held in trusted extension session storage; API keys are bound to their endpoint.
- The service worker rejects stale provider configurations and cancels active requests on credential revision changes.
- A provider failure is reported without sending the text to a different provider.
- The six selectable Ollama models are exercised against a protected-placeholder and terminology evaluation corpus through the real OpenAI-compatible endpoint with `npm run test:ollama` when preparing a local-provider build.
- The latest hardware, runtime, latency, and per-model pass counts are recorded in [OLLAMA_MODEL_EVALUATION.md](OLLAMA_MODEL_EVALUATION.md).
- Translation cache entries are scoped by provider, glossary state, and local correction state.
- Local corrections and diagnostics stay in Chrome extension storage.
- Diagnostics show counts and provider path, not original or translated lesson text.

Before release, confirm:

- `PRIVACY_POLICY.md` and `store-assets/STORE_LISTING.md` describe the same explicit engine choices and no-cross-provider-fallback behavior.
- Runtime files do not load remote hosted SDK scripts.
- The legacy terminology-review bridge stays disabled. Reading explanations use the explicit provider facade and distinguish bundled reference definitions from generated notes.

## Glossary Evidence

- Premium glossary packs are registered in `src/data/glossary.index.json`.
- Current generated status is tracked in `docs/GLOSSARY_STATUS.md`.
- `llm-audited` packs must keep audit metadata and pass glossary quality checks.
- `community-reviewed`, `native-reviewed`, and `reviewed` labels require documented review evidence.
- A language must not be promoted only because it has the same term count as another pack.

## Live QA Evidence

Required live QA surfaces are listed in `docs/LIVE_QA_MANIFEST.json`.

Before Chrome Web Store submission:

- Run the automated release gate.
- Recheck required live Academy surfaces manually.
- Capture sanitized fixtures only when they improve automated coverage.
- Do not commit screenshots or fixtures with account names, profile images, notifications, progress, certificates, tokens, emails, or telemetry metadata.

## Automated Gates

Core local gate:

```bash
npm run check:full
```

Release/operations gate:

```bash
npm run release:preflight
```

Focused evidence commands:

```bash
npm run check:all
npm run test:e2e
npm run glossary:status
npm run check:operations
npm run store:screenshots
```

Security gates:

- GitHub vulnerability alerts and Dependabot security updates are enabled for dependency vulnerability follow-up.
- Secret scanning and push protection are enabled at the repository security settings layer.
- `.github/workflows/codeql.yml` runs CodeQL JavaScript analysis on pull requests, pushes to `main`, and a weekly schedule.
- GitHub Actions checkout steps disable persisted credentials.

Release artifact evidence:

- `npm run build:zip` creates `dist/academy-lens.zip`.
- The same command writes `dist/academy-lens.zip.sha256` with a SHA-256 checksum for the zip.
- `npm run check:files` verifies the checksum matches the built zip when the artifact exists.

## Current Known Gaps

- New API/Puter connections, native explanation support, and reader interactions have not been executed or debugged. Test source was added without running it.
- Puter currently needs a supplied token; a user-friendly sign-in flow remains outstanding.
- Structural checks do not establish semantic translation accuracy; multilingual evaluation is still required.
- Real logged-in Academy DOM needs periodic sanitized recapture before store submission.
- Most premium glossary packs are AI-audited beta, not final reviewed packs.
- Final public screenshots still need a manual privacy review pass.
- Demo video is not part of the automated release workflow yet.
