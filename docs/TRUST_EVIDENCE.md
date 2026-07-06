# Trust Evidence

Last reviewed: 2026-07-06 KST

AcademyLens is an open-source beta for OpenAI Academy learners.

**Unofficial, not affiliated with OpenAI.**

This page collects release evidence that should stay easy to inspect before any public store submission or promotional release.

## Runtime Scope

- Runs only on `https://academy.openai.com/*`.
- Translates extension-selected visible course or lesson text.
- Avoids Gradual platform chrome such as enrollment, progress, certificates, quizzes, account controls, forms, navigation, cookie prompts, and status surfaces.
- Does not change enrollment, course progress, certificates, account state, or OpenAI Academy settings.
- Does not run an AcademyLens server, require an API key, or load remote AI scripts.

## Provider And Privacy Evidence

- Browser-native Translator API is tried first when available.
- Browser-managed translator downloads remain disabled unless the user explicitly enables them.
- Google Translate through `translate.googleapis.com` is the fallback when browser-native translation is unavailable or misses text.
- Translation cache entries are scoped by provider, glossary state, and local correction state.
- Local corrections and diagnostics stay in Chrome extension storage.
- Diagnostics show counts and provider path, not original or translated lesson text.

Before release, confirm:

- `PRIVACY_POLICY.md` and `store-assets/STORE_LISTING.md` describe the same provider order and fallback behavior.
- Runtime files do not load remote hosted SDK scripts.
- AI review remains disabled unless a compliant explicit opt-in bridge and updated privacy text exist.

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

- Real logged-in Academy DOM needs periodic sanitized recapture before store submission.
- Most premium glossary packs are AI-audited beta, not final reviewed packs.
- Final public screenshots still need a manual privacy review pass.
- Demo video is not part of the automated release workflow yet.
