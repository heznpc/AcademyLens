# Release Checklist

Last reviewed: 2026-06-24

AcademyLens is not ready for Chrome Web Store submission just because the build zip exists. Use this checklist before any public release, store upload, or promotional push.

## Required Gates

- `npm run release:preflight` passes before any public release or store asset pass.
- `npm run check:full` passes on a clean checkout.
- `npm run build:zip` produces `dist/academy-lens.zip`.
- `git status --short` is clean after verification, except for intentional release artifacts.
- CI is green on the pushed commit.
- The manifest, README, store listing, and privacy policy all keep `Unofficial, not affiliated with OpenAI.`
- Runtime files contain no remote hosted SDK scripts, including Puter.js.

## Academy DOM QA

- Use [LIVE_QA_MANIFEST.json](LIVE_QA_MANIFEST.json) as the required surface list.
- Test public course pages.
- Test a logged-in course overview page.
- Test a logged-in lesson page with Gradual sidebars/topbars/progress visible.
- Test delayed lesson or embedded frame content if present.
- Confirm Translate does not change enrollment, progress, certificate, quiz, account, search, notification, or navigation controls.
- Confirm Restore returns translated course text to the original visible text.
- Capture sanitized fixture updates only when they remove personal data, session tokens, telemetry IDs, and remote scripts.

## Glossary QA

- Run `npm run glossary:status`.
- Run `npm run glossary:scoreboard` and commit `docs/GLOSSARY_STATUS.md` when glossary metadata changes.
- Run `npm run check:glossary-status`.
- Keep store wording at `community-reviewed` or `AI-drafted beta` unless metadata evidence supports `reviewed`.
- For each promoted language, close X translation cross-check, community review, and native review notes in glossary metadata.
- Run `npm run glossary:audit -- --locale=<locale>` before asking external reviewers.
- Run `npm run check:glossary` and `npm run check:glossary-overreach`.

## Privacy And Provider QA

- Confirm whether the release still uses the Google Translate web endpoint.
- Confirm privacy copy says extension-selected visible lesson text is sent to Google Translate fallback.
- Confirm privacy copy says auto-translate can send newly rendered visible lesson text when enabled.
- Confirm privacy copy says original visible text, translated text, target language, and cache timestamps may be stored locally.
- Do not describe the current Google Translate endpoint as the official Google Cloud Translation API.
- Do not enable GPT/Puter/OpenAI review without an explicit opt-in UX, updated privacy text, and Chrome Web Store policy review.

## Store Assets

- Generate a local screenshot pass with `npm run store:screenshots`, then review the output under `dist/store-screenshots/`.
- Capture screenshots from a reviewed build, not from a dirty workspace.
- Avoid screenshots with account names, profile photos, notifications, certificates, or private course progress.
- Show the floating panel on real Academy-style course content.
- Show Translate, Restore, language state, glossary state, and the unofficial notice.
- Record a short demo only after the same build passes `npm run check:full`.

## Publish Hygiene

- Use `heznpc` as the sole commit author.
- Do not add `Co-Authored-By` trailers.
- Do not include tokens, keys, account identifiers, personal emails, screenshots with personal data, `.pem`, `.crx`, `.har`, `.trace`, or `.webm` files.
- Inspect the zip contents before upload.
