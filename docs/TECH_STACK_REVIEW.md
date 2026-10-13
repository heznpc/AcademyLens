# Technical Stack Review

Design decision: 2026-10-13 KST. Implementation is statically reviewed; no execution, build, tests, or debugging were performed for this change.

## Chosen structure

Keep the MV3 content script, background worker, DOM translation records, generation cancellation, glossary masking, local corrections, and provider-scoped cache. Extend the provider facade with translation and explanation, and add a separate reading panel that consumes existing records. Original lookup needs no inference or network.

Three designs were considered by parallel reviewers:

| Design | Assessment |
| --- | --- |
| Extend provider facade + separate reading panel | Selected: preserves restoration and embedded-frame ownership while adding provider choice and notes. |
| Replace text processing with a document AST and inline annotations | Deferred: richer paragraph semantics but broad changes to mutation, quiz filtering, and restoration. |
| Move all translation into a side panel | Rejected for this iteration: simplifies DOM ownership but removes the existing in-place reading experience. |

## Provider behavior

| Choice | Translation | Requested explanation |
| --- | --- | --- |
| On-device (default) | Chrome Translator | Bundled reference definitions first; otherwise Chrome LanguageModel, then native translation to the selected language |
| Google Translate | Existing web endpoint | Translation of matching bundled reference definitions |
| Local Ollama | Existing local model | Same selected model |
| Puter | Packaged HTTP adapter to Puter's AI driver | Same selected model |
| AI API | User's HTTPS OpenAI-compatible chat-completions endpoint | Same selected endpoint/model |

There is no cross-provider fallback. Unsupported capabilities are reported. Browser downloads need explicit opt-in. Apple Foundation Models would require a separate native integration and are not part of this implementation.

Puter integration uses the request protocol behind Puter.js, without loading its remotely hosted SDK. Its account token is entered explicitly. This is not a completed sign-in integration; protocol/auth behavior requires live verification before release. Paid chat subscriptions and API billing are separate; an API provider must support the supplied credential and endpoint.

## Request and storage boundaries

- Google, localhost, Puter, and arbitrary HTTPS provider origins are optional permissions. The broad HTTPS declaration permits user-configured origins; the popup requests only the selected origin.
- API keys and Puter tokens are stored in Chrome extension session storage, restricted to trusted extension contexts. API keys are bound to the configured endpoint. They are absent from settings and translation caches.
- The worker checks the current engine, model, endpoint, credential revision, and permission. Connection changes abort active operations. AI requests reject redirects.
- Selected passage and bounded lesson context are sent only to the selected provider.
- AI cache identity includes provider configuration and prompt/context identity. Explanations use a bounded memory cache.
- Restore, navigation, language/provider changes, and frame lifecycle invalidate pending work.

## Quality and resource decisions

Preserve glossary placeholders, local correction precedence, response-count checks, language/variant checks, and per-item quality recovery. AI translation instructions preserve negation, numbers, conditions, and terminology. These checks detect specific defects, not all mistranslations.

Bundled definitions are AcademyLens paraphrases with links, not official quotations. Glossary editorial notes are not learner definitions. Generated notes are labeled separately and do not invent reference URLs. On-device model sessions are destroyed on cancellation and after use; generative and translation sessions are not intentionally kept active together.

Before release: validate authentication, native API availability in extension/embedded contexts, semantic quality across languages, keyboard/screen-reader behavior, and translated course navigation. Runtime verification remains outstanding at the user's instruction.
