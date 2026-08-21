# Technical Stack Review

Last reviewed: 2026-08-21 KST

AcademyLens should keep the current MV3, frontend-only, no-server architecture for the default runtime, but it should not treat any translation provider path as final Chrome Web Store submission posture until provider/privacy review is closed.

## Decision

| Candidate                                            | Decision                                                    | Reason                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current MV3 content script + background worker       | Keep                                                        | Best fit for DOM filtering, Restore, generation guards, and local cache.                                                                                                                                                                                                                            |
| Current Google Translate web endpoint                | Keep as an opt-in engine behind an optional host permission | Useful for fast no-key translation and it is the only path that serves pre-Chrome-138 browsers and language pairs the on-device translator lacks. It is not the official authenticated Google Cloud Translation path, so it must never be the default and must never be a required host permission. |
| Google Cloud Translation API                         | Reject for default runtime                                  | Official path requires project setup plus API key or credentials, which conflicts with no-key/no-server.                                                                                                                                                                                            |
| Remote Puter.js/GPT script                           | Reject for runtime                                          | Remote hosted code risk is too high for Chrome Web Store review. Keep only disabled bridge skeleton.                                                                                                                                                                                                |
| OpenAI API from extension                            | Reject for default runtime                                  | It requires user/developer key handling or a server. That conflicts with the no-key, no-server product principle.                                                                                                                                                                                   |
| Browser-native Translator API                        | Default engine                                              | Use when already available, or when the user explicitly allows browser-managed language downloads. Keep the Google Translate engine available as an opt-in choice because browser/version/language support is not universal, and a learner on an unsupported pair would otherwise get nothing.      |
| User-operated Ollama on localhost                    | Keep as an opt-in local engine                              | Reuses models already installed outside the extension, needs no API key, and keeps requests on the learner's machine. It requires a separately running Ollama server, an optional localhost permission, and model-specific latency/resource expectations.                                           |
| Local correction and diagnostics storage             | Keep local-only                                             | Learner corrections, cache scope metadata, and runtime diagnostics improve repeat-use quality without adding an AcademyLens server or remote AI dependency.                                                                                                                                         |
| Local offline translation model bundled in extension | Reject for now                                              | Bundle size, language coverage, performance, and CWS review complexity are not worth it for this product stage.                                                                                                                                                                                     |
| Server-side translation proxy                        | Reject for now                                              | Better control, but changes privacy posture and creates an operating cost/backend trust surface.                                                                                                                                                                                                    |

## Source Notes

- Chrome Web Store MV3 policy says extension functionality must be discernible from submitted code, and external resources must not contain logic. It lists remote script tags, remote eval, and remote command interpreters as common violations. Source: `https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements/` (last updated 2024-04-03).
- Chrome's remote-hosted-code migration guide defines RHC as browser-executed JavaScript/WASM loaded from outside the extension package and says MV3 extensions need to bundle all code they use. Source: `https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code/`.
- Google Cloud Translation authentication docs describe programmatic access through client libraries, REST, ADC, gcloud credentials, service accounts, and API keys for Basic v2 methods. Source: `https://docs.cloud.google.com/translate/docs/authentication/` (last updated 2026-06-23).
- Google Cloud Translation setup docs require project/API/authentication setup before use. Source: `https://docs.cloud.google.com/translate/docs/setup/` (last updated 2026-06-18).
- MDN documents Translator and Language Detector APIs as limited/experimental web APIs that require recent user interaction for object creation. Source: `https://developer.mozilla.org/en-US/docs/Web/API/Translator_and_Language_Detector_APIs/` (last modified 2026-05-18).
- Microsoft Edge documented Translator/Language Detector APIs for sites and extensions as an on-device direction in June 2026. Source: `https://blogs.windows.com/msedgedev/2026/06/02/expanding-on-device-ai-in-microsoft-edge-new-models-and-apis-for-the-web/`.
- Chrome built-in Translator API is documented as a browser AI translation path, but it is not a stable universal replacement for AcademyLens because support depends on Chrome/version/language availability and page context. Source: `https://developer.chrome.com/docs/ai/translator-api/`.

## Engine Selection Invariants

The learner picks the engine; the runtime never silently escalates to the network.

- `DEFAULT_SETTINGS.translationEngine` is `device`. An unknown or missing value normalizes to `device`, never to a remote engine.
- `translate.googleapis.com` stays in `optional_host_permissions`. `npm run check:files` fails if it appears in `host_permissions`.
- `localhost:11434` also stays optional. The service worker checks the localhost grant before an Ollama request, and an Ollama failure never falls through to Google Translate.
- The content script gates the remote path on the selected engine, and the service worker independently re-checks `chrome.permissions.contains` before any remote request. A failed or unreadable permission check fails closed.
- Declining the permission prompt reverts the selection to `device` instead of leaving a broken state.

## Accepted Follow-Up

Keep engine selection to the four documented values and preserve privacy copy and E2E coverage for every path. Ollama model names are allowlisted and model identity remains part of the cache provider scope.

Cache entries should remain scoped by provider, glossary signature, and local correction signature. This keeps native-provider experiments from silently reusing Google fallback output when the user changes provider posture.

## Future Experiment Shape

If browser-native Translator APIs become broadly available for extension content scripts:

1. Keep Google Translate as fallback until coverage and quality are proven across Academy surfaces.
2. Keep UI for model-download/availability state when required by the browser.
3. Keep privacy copy for browser-managed language packs and Google fallback.
4. Keep E2E coverage for provider selection, explicit download opt-in, and fallback.
5. Keep glossary placeholder masking before either provider.
