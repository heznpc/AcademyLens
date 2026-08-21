# Privacy Policy

AcademyLens translates visible OpenAI Academy course content in the browser.

**Unofficial, not affiliated with OpenAI.**

## Data Collection

AcademyLens does not collect, sell, rent, or transfer personal data to the extension developer.

## Data Processed By The Extension

### You choose the translation engine

AcademyLens ships with four engines and defaults to the one that sends nothing off your device.

| Engine                                        | What happens to course text                                                                                                        | Network access                                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **On-device only** (default)                  | Chrome's built-in Translator API translates on your device. No course text leaves your computer.                                   | None                                                                                           |
| **On-device, then Google Translate** (`auto`) | On-device translation runs first. Only text the on-device engine could not translate is sent to Google Translate for that request. | Requires your explicit permission grant                                                        |
| **Google Translate** (`remote`)               | Extension-selected visible lesson text is sent to Google Translate.                                                                | Requires your explicit permission grant                                                        |
| **Local Ollama** (`ollama`)                   | Extension-selected visible lesson text is sent to the Ollama server on `localhost` and processed by the model you selected.        | Requires your explicit localhost permission grant and a separately running local Ollama server |

The Google Translate host `translate.googleapis.com` and local Ollama host `localhost:11434` are declared as **optional** host permissions. A default installation has neither. AcademyLens asks only for the permission required by the engine you pick, and the extension's service worker re-checks the grant before every request. Ollama text is sent to the server on your own computer; AcademyLens does not configure any remote Ollama host.

When you translate page text, the extension processes extension-selected visible lesson text from `academy.openai.com`. Browser-managed translator downloads are disabled unless you explicitly turn them on. If auto-translate is enabled, newly rendered visible lesson text can be translated automatically after page changes, using whichever engine you selected. The DOM filtering logic is designed to avoid platform chrome such as enrollment, progress, certificate, account, form, navigation, and credential UI. Because OpenAI Academy and Gradual page markup can change, avoid translating pages that contain sensitive personal content.

## Data Stored Locally

AcademyLens stores settings, optional local correction overrides, and a local translation cache in Chrome extension storage:

- target language
- selected translation engine
- selected Ollama model
- auto-translate preference
- browser-native translator download preference
- locally corrected original visible text
- locally corrected translated text
- target language, creation time, and last-access time for correction entries
- cached original visible text
- cached translated text
- provider, glossary state, target language, creation time, and last-access time for cache entries

The panel may show local diagnostics such as provider path, cache hit/miss counts, fallback count, correction count, context grouping count, and embedded-frame applied/failed counts. These diagnostics are displayed locally and do not include the translated page text.

Bundled glossary files are stored inside the extension package. They do not require a network request to AcademyLens or any AcademyLens server.

## What AcademyLens Does Not Do

- It does not read or change your OpenAI Academy enrollment.
- It does not read or change your course progress.
- It does not access certificates.
- It does not request your OpenAI or ChatGPT credentials.
- It does not run a backend server.
- It does not require an API key.
- It does not load remote AI scripts.
- It does not send local correction lists or diagnostics to AcademyLens.
- It does not run GPT/Puter-based review in the current runtime. The included AI review bridge is disabled and cannot send review text.
- It does not connect to X/Twitter. Public X translation checks are a manual glossary QA process outside the extension runtime.

## Third Parties

AcademyLens currently uses:

- Browser-native Translator API when available or explicitly download-enabled. This runs on your device.
- Google Translate, only when you select an engine that uses it and grant the optional host permission.
- Your separately installed local Ollama server, only when you select Local Ollama and grant the optional localhost permission.

The Google Translate path uses the public `translate.googleapis.com` web endpoint. This is not the official authenticated Google Cloud Translation API, so it carries no service agreement covering your text. That is why it is opt-in rather than the default.

Review those services and browser features before using translation with sensitive content. The current runtime does not use Google Cloud Translation credentials, an AcademyLens server, or an OpenAI API key. AcademyLens calls Ollama's OpenAI-compatible local endpoint without an API key; the selected model is installed and operated separately by you.

An optional AI tutor is planned and will ship off by default. When you turn on its cloud engine, your question and the relevant lesson text for that request are sent through a locally bundled Puter.js bridge to a remote model, and a free Puter sign-in is required. Its on-device engine (Chrome Gemini Nano) needs no account and keeps everything on your device. By default, and for the translation features described above, no text is sent to any AI tutor service, and learners who use neither engine keep the full no-account baseline.
