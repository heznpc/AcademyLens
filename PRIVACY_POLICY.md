# Privacy Policy

AcademyLens translates visible OpenAI Academy course content in the browser.

**Unofficial, not affiliated with OpenAI.**

## Data Collection

AcademyLens does not collect, sell, rent, or transfer personal data to the extension developer.

## Data Processed By The Extension

When you translate page text, the extension sends selected visible text from `academy.openai.com` to Google Translate through `translate.googleapis.com`. The DOM filtering logic is designed to avoid platform chrome such as enrollment, progress, certificate, account, form, navigation, and credential UI. Because OpenAI Academy and Gradual page markup can change, avoid translating pages that contain sensitive personal content.

## Data Stored Locally

AcademyLens stores settings and a local translation cache in Chrome extension storage:

- target language
- auto-translate preference
- cached translation text

Bundled glossary files are stored inside the extension package. They do not require a network request to AcademyLens or any AcademyLens server.

## What AcademyLens Does Not Do

- It does not read or change your OpenAI Academy enrollment.
- It does not read or change your course progress.
- It does not access certificates.
- It does not request your OpenAI or ChatGPT credentials.
- It does not run a backend server.
- It does not require an API key.
- It does not load remote AI scripts.
- It does not run GPT/Puter-based review in the current runtime. The included AI review bridge is disabled and cannot send review text.
- It does not connect to X/Twitter. Public X translation checks are a manual glossary QA process outside the extension runtime.

## Third Parties

AcademyLens uses:

- Google Translate for fast translation.

Review that service's policy before using translation with sensitive content.

If AI-assisted terminology review is added later, it will require explicit opt-in wording before use.
