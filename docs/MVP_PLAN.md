# MVP Plan

## Positioning

AcademyLens helps learners translate OpenAI Academy course content in their language while preserving important AI terminology.

Store name: AcademyLens for OpenAI Academy (Unofficial)

Initial brand sentence: Translate OpenAI Academy course content in your language.

Current store sentence: Translate OpenAI Academy course content in your language with protected AI terminology.

Required notice: Unofficial, not affiliated with OpenAI.

## In Scope

- OpenAI Academy pages under `academy.openai.com`.
- Course listing and public course detail pages.
- Login-only lesson pages as best-effort DOM translation after the user signs in.
- Thirteen premium AI terminology glossary packs.
- Google Translate fast translation in the current runtime, with provider/privacy review before any store submission.
- Glossary correction for reviewed packs and clearly labeled AI-audited beta packs.
- Protected-term preservation for all target languages.
- Clear UI disclosure when a selected language is using final/native-reviewed, community-reviewed, AI-audited beta, AI-drafted beta, or protected-term-only machine translation support.
- Generation guard for restore/language/route-change races.
- Playwright E2E coverage for core translation flows, study-room-style DOM, and visual smoke checks.

## Out Of Scope For MVP

- AI Tutor.
- Puter.js or other remote-script AI review.
- Chat history.
- Flashcards.
- YouTube subtitle automation.
- Certificate, enrollment, progress, or account automation.
- Any server-side API.

## DOM Strategy

OpenAI Academy uses Next.js and Gradual. Public pages include `__NEXT_DATA__`, Gradual IDs such as `gradual-topbar` and `gradual-sidebar`, and Emotion-generated class names.

The MVP avoids hash class selectors and uses:

- URL allowlist for `academy.openai.com`.
- text-node walking under `document.body`.
- explicit exclusion of topbar/sidebar/navigation/code/form elements.
- extra filtering for Gradual progress, certificate, quiz, and account controls.
- MutationObserver for Gradual/Next.js navigation.

## Quality Bar

AcademyLens should not be treated as store-ready just because the panel works. Before any submission decision, it needs:

- passing unit tests and Playwright E2E
- logged-in-style lesson/study-room fixture coverage
- sanitized live lesson/study-room fixture capture when a logged-in browser profile is available
- manual verification on at least one real OpenAI Academy lesson page
- review of privacy/store wording against the implemented runtime
- no remote hosted code for AI review
