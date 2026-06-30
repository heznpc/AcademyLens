# Operations

AcademyLens is an open-source beta. Operational quality means repeatable evidence, not just a passing build.

**Unofficial, not affiliated with OpenAI.**

## Routine Commands

Use these commands before a public release, store asset pass, or major glossary promotion:

```bash
npm run glossary:scoreboard
npm run check:full
npm run store:screenshots
npm run check:operations
npm run release:preflight
```

`npm run check:full` is the product correctness gate. `npm run release:preflight` is the heavier operations gate: it runs the full product gate, generates local store screenshot drafts, and re-checks operations metadata.

## Live Academy DOM QA

The required live QA surface list lives in [LIVE_QA_MANIFEST.json](LIVE_QA_MANIFEST.json). Treat it as the release checklist source of truth.

Before Chrome Web Store submission or a promotional push:

1. Load AcademyLens as an unpacked extension in Chrome.
2. Visit each surface listed in `requiredBeforeStore`.
3. Confirm Translate and Restore work on visible course or lesson content.
4. Confirm Gradual controls remain usable and untranslated: navigation, search, account, enrollment, progress, certificate, quiz, status, and CTAs.
5. Capture a sanitized fixture only when it improves automated coverage.
6. Do not commit screenshots or fixtures with account names, profile images, notifications, progress, certificates, tokens, emails, or telemetry metadata.

Use the capture helper for reviewed fixture candidates:

```bash
npm run qa:live
```

The command writes to `/tmp` by default and prints a redaction report. To intentionally write under `tests/fixtures`, first review the output and then rerun `npm run capture:academy` with `--allow-fixture-write`.

## Glossary Operations

The current glossary board is generated in [GLOSSARY_STATUS.md](GLOSSARY_STATUS.md).

When glossary metadata or terms change:

```bash
npm run glossary:scoreboard
npm run check:glossary
npm run check:glossary-status
npm run check:glossary-overreach
```

Promotion rules:

- `llm-drafted` is allowed as beta correction data, but public copy must call it AI-drafted beta.
- `community-reviewed` requires fluent community review evidence.
- `native-reviewed` requires native-speaker review evidence.
- `reviewed` requires complete official alignment, closed X translation check, closed community/native review, and passing smoke tests.
- Do not promote a language just because it has the same term count as other packs.

## Provider And Privacy Audit

Current runtime behavior:

- Google Translate endpoint is the active translation provider.
- Browser-native Translator API is feature-detected only.
- GPT/Puter/OpenAI review is disabled.
- No AcademyLens server is used.

Before public release:

1. Confirm `PRIVACY_POLICY.md` still says visible selected text can be sent to Google Translate.
2. Confirm store copy does not describe the endpoint as Google Cloud Translation API.
3. Confirm runtime files do not load remote hosted SDK scripts.
4. Confirm AI review remains disabled unless there is explicit opt-in UX and updated privacy text.

## Store Asset Operations

Draft fixture screenshots:

```bash
npm run store:screenshots
```

Outputs are written to `dist/store-screenshots/`, which is intentionally ignored. These are review drafts, not automatic release assets.
The optional `--path` argument is restricted to fixture routes with explicit Translate/Restore assertions.

Final public screenshots should be reviewed manually for:

- no private account details
- no certificate, progress, notification, or profile data
- visible unofficial notice
- no claim of OpenAI affiliation
- panel readable at desktop and mobile sizes

## Contributor Operations

Useful external contributions:

- locale glossary reviews
- X translation cross-check notes
- sanitized fixture improvements
- live QA reports
- accessibility and visual QA notes
- public copy, README, store listing, and screenshot review improvements that keep the unofficial positioning clear

Every PR should keep the unofficial positioning intact, avoid remote hosted runtime code, and preserve protected terms.
Final merge authority is intentionally centralized through CODEOWNERS while the project is pre-release; external reviewer evidence should be captured in issues, PR notes, QA reports, or glossary audit packets before status promotion.
