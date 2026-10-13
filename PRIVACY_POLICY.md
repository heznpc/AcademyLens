# Privacy Policy

AcademyLens translates visible OpenAI Academy course content in the browser and provides requested reading explanations.

**Unofficial, not affiliated with OpenAI.**

## Data collection

AcademyLens does not collect, sell, or transfer personal data to the extension developer and operates no backend server.

## Provider choice

| Engine | Processing and network access |
| --- | --- |
| On-device (default) | Chrome Translator and, for requested explanations, Chrome LanguageModel. Course text stays on the device. Browser model downloads require explicit opt-in. |
| Google Translate | Selected text is sent to Google Translate with optional permission. Explanations are limited to translating matching bundled definitions. |
| Local Ollama | Selected text and bounded lesson context are sent to the selected model on localhost, requiring optional localhost permission and a separately running server. |
| Puter | Selected text and bounded lesson context are sent to Puter's AI endpoint using the selected model and user-supplied token, requiring optional Puter permission. |
| AI API | Selected text and bounded lesson context are sent to the user's configured HTTPS chat-completions endpoint using their model and API key, requiring optional permission for that origin. |

No engine failure automatically switches to another provider. The worker checks provider selection and permission before requests. Auto-translate can process newly rendered visible lesson text using the selected provider. Explanations are requested individually.

The manifest declares optional Google, localhost, Puter, and HTTPS origin access. The general HTTPS declaration enables user-configured API endpoints; it does not grant every origin at installation. The connection form requests only the selected origin.

The extension filters platform controls, forms, account content, progress, certificates, and assessment controls out of its course-text processing. Site markup changes can affect those filters.

## Local storage

Chrome extension local storage holds language and provider preferences, endpoint/model names, glossary state, correction overrides, and translation cache entries. Cache entries can contain original/translated text, provider/context identifiers, and timestamps. Diagnostics contain counts and provider paths.

API keys and Puter tokens are kept in Chrome extension session storage, restricted to trusted extension contexts, and cleared when the browser session ends or the user clears the connection. API keys are bound to the saved endpoint. Keys and tokens are not stored in ordinary settings, translation caches, or content-page DOM.

Original-text records and a bounded explanation cache remain in page memory. Bundled terminology and definition files are packaged with the extension. Opening their reference links navigates to those external sites.

## Third parties

Google mode uses the public translate.googleapis.com web endpoint, not authenticated Google Cloud Translation. Puter mode uses a packaged HTTP adapter to api.puter.com; it does not download or execute Puter.js. API mode uses a provider supplied by the learner. Those providers' own processing and retention terms apply. Ollama is separately operated by the learner on localhost.

A paid chat subscription does not necessarily include API access or credits. The default on-device path needs no account or API key. Chrome capability and model availability vary by device, language, browser, and page context.

## Scope

AcademyLens does not change enrollment, course progress, certificates, accounts, or Academy settings. It does not request Academy login credentials, load remote AI scripts, or upload local correction lists to the developer. The older terminology-review bridge remains disabled; requested reading explanations use the explicit provider paths described above.
