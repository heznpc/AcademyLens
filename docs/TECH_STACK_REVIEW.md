# Technical Stack Review

Last reviewed: 2026-07-01 KST

AcademyLens should keep the current MV3, frontend-only, no-server architecture for the default runtime, but it should not treat any translation provider path as final Chrome Web Store submission posture until provider/privacy review is closed.

## Decision

| Candidate                                            | Decision                                     | Reason                                                                                                                                                                                                |
| ---------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current MV3 content script + background worker       | Keep                                         | Best fit for DOM filtering, Restore, generation guards, and local cache.                                                                                                                              |
| Current Google Translate web endpoint                | Keep as fallback runtime / review before CWS | Useful for fast no-key translation, but it is not the official authenticated Google Cloud Translation path. Do not market it as a final store-ready provider until privacy/provider review is closed. |
| Google Cloud Translation API                         | Reject for default runtime                   | Official path requires project setup plus API key or credentials, which conflicts with no-key/no-server.                                                                                              |
| Remote Puter.js/GPT script                           | Reject for runtime                           | Remote hosted code risk is too high for Chrome Web Store review. Keep only disabled bridge skeleton.                                                                                                  |
| OpenAI API from extension                            | Reject for default runtime                   | It requires user/developer key handling or a server. That conflicts with the no-key, no-server product principle.                                                                                     |
| Browser-native Translator API                        | Optional first runtime path                  | Use when already available, or when the user explicitly allows browser-managed language downloads. Keep Google Translate fallback because browser/version/language support is not universal.          |
| Local correction and diagnostics storage             | Keep local-only                              | Learner corrections, cache scope metadata, and runtime diagnostics improve repeat-use quality without adding an AcademyLens server or remote AI dependency.                                           |
| Local offline translation model bundled in extension | Reject for now                               | Bundle size, language coverage, performance, and CWS review complexity are not worth it for this product stage.                                                                                       |
| Server-side translation proxy                        | Reject for now                               | Better control, but changes privacy posture and creates an operating cost/backend trust surface.                                                                                                      |

## Source Notes

- Chrome Web Store MV3 policy says extension functionality must be discernible from submitted code, and external resources must not contain logic. It lists remote script tags, remote eval, and remote command interpreters as common violations. Source: `https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements/` (last updated 2024-04-03).
- Chrome's remote-hosted-code migration guide defines RHC as browser-executed JavaScript/WASM loaded from outside the extension package and says MV3 extensions need to bundle all code they use. Source: `https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code/`.
- Google Cloud Translation authentication docs describe programmatic access through client libraries, REST, ADC, gcloud credentials, service accounts, and API keys for Basic v2 methods. Source: `https://docs.cloud.google.com/translate/docs/authentication/` (last updated 2026-06-23).
- Google Cloud Translation setup docs require project/API/authentication setup before use. Source: `https://docs.cloud.google.com/translate/docs/setup/` (last updated 2026-06-18).
- MDN documents Translator and Language Detector APIs as limited/experimental web APIs that require recent user interaction for object creation. Source: `https://developer.mozilla.org/en-US/docs/Web/API/Translator_and_Language_Detector_APIs/` (last modified 2026-05-18).
- Microsoft Edge documented Translator/Language Detector APIs for sites and extensions as an on-device direction in June 2026. Source: `https://blogs.windows.com/msedgedev/2026/06/02/expanding-on-device-ai-in-microsoft-edge-new-models-and-apis-for-the-web/`.
- Chrome built-in Translator API is documented as a browser AI translation path, but it is not a stable universal replacement for AcademyLens because support depends on Chrome/version/language availability and page context. Source: `https://developer.chrome.com/docs/ai/translator-api/`.

## Accepted Follow-Up

Do not add a large provider abstraction yet. Keep provider selection small: browser-native Translator may run first when available or explicitly download-enabled, and Google Translate remains the fallback provider. Preserve privacy copy and E2E coverage for both paths.

Cache entries should remain scoped by provider, glossary signature, and local correction signature. This keeps native-provider experiments from silently reusing Google fallback output when the user changes provider posture.

## Future Experiment Shape

If browser-native Translator APIs become broadly available for extension content scripts:

1. Keep Google Translate as fallback until coverage and quality are proven across Academy surfaces.
2. Keep UI for model-download/availability state when required by the browser.
3. Keep privacy copy for browser-managed language packs and Google fallback.
4. Keep E2E coverage for provider selection, explicit download opt-in, and fallback.
5. Keep glossary placeholder masking before either provider.
