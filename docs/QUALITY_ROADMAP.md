# Quality Roadmap

Last reviewed: 2026-06-24

AcademyLens is usable as an open-source beta, but it should not be treated as Chrome Web Store-ready until the checks below are closed.

## Current Readiness

| Area                  | Status         | Quality bar before store submission                                                                                                                                           |
| --------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime translation   | Good beta      | Keep `npm run check:full` green, avoid duplicate provider calls, and add fixtures when Academy markup changes.                                                                |
| Logged-in Academy DOM | Better beta    | Keep public course, logged-in courses, study room, live lesson shell, delayed SCORM, and in-frame lesson navigation covered; add sanitized real captures when markup changes. |
| Glossary quality      | Mixed          | Promote packs only after documented community/native review and closed QA signals.                                                                                            |
| Privacy/store copy    | Improved draft | Re-check against actual runtime network behavior before submission.                                                                                                           |
| UX polish             | Beta           | Keep panel compact, status-rich, keyboard accessible, and non-official in tone.                                                                                               |
| AI review             | Disabled       | Do not enable until there is a Chrome Web Store-compliant, explicit opt-in bridge.                                                                                            |

## Implementation Priorities

1. Expand sanitized DOM fixtures for logged-in pages.
   - Keep fixtures small and scrubbed.
   - Include Gradual chrome, progress, quiz, certificate, account, cookie/toast, and SCORM surfaces.
   - Add assertions that those surfaces are not translated.

2. Raise glossary confidence language by language.
   - Use `npm run glossary:status` to pick review targets.
   - Use `npm run glossary:audit -- --locale=<locale>` before asking for review.
   - Promote `llm-drafted` only after the review evidence is represented in the glossary metadata.

3. Preserve Chrome Web Store policy margin.
   - Keep remote hosted scripts out of runtime files.
   - Treat X translation checks as manual evidence only.
   - Keep GPT/Puter review disabled until an opt-in bridge is reviewed and documented.

4. Improve UX without implying OpenAI affiliation.
   - Show clear status, progress, restore, and glossary state.
   - Avoid product claims that sound official.
   - Keep `Unofficial, not affiliated with OpenAI.` visible in store-facing surfaces.

5. Release hygiene.
   - `npm run check:full` must pass locally and in CI.
   - `npm run release:preflight` must pass before public release or store asset preparation.
   - `npm run build:zip` must create a zip with only expected extension files.
   - Store screenshots/video should be captured from a reviewed build, not from a dirty workspace.
   - Follow [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) before any store upload or promotional release.

## Current Blockers To "Done"

- 12 of 13 premium glossary packs are still `llm-drafted`.
- Korean is `community-reviewed`, not final `reviewed`.
- Real logged-in Academy DOM still needs periodic sanitized recapture from live Academy pages before a store submission.
- Store screenshots can be generated locally, but final public screenshots still need a reviewed real-session capture pass with private account surfaces removed.
- Chrome Web Store privacy copy needs one final review against the exact release build and provider path.
- Demo video is not part of the automated release workflow yet.

## Non-Goals

- Do not add AI Tutor before translation quality is trusted.
- Do not add remote hosted SDK scripts.
- Do not automate enrollment, progress, certificate, quiz, account, or X/Twitter interactions.
