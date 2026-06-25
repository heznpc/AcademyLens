# AI Review Bridge Sketch

AcademyLens does not run AI-assisted terminology review in the current runtime. The repo includes a disabled local bridge skeleton at `src/lib/ai-review-bridge.js` so tests and file checks can enforce that this remains explicit.

## Constraint

Chrome Web Store policy can treat remote hosted JavaScript as a review risk. AcademyLens must not load `https://js.puter.com/*` or any other remote AI SDK script in the extension runtime.

## Acceptable Direction

- Keep translation usable without AI review.
- Add review only behind an explicit opt-in control.
- Use a locally reviewed bridge or another Chrome Web Store-compliant integration.
- Update the privacy policy before enabling the feature.
- Show exactly what text is sent for review.

## Non-Goals

- No hidden GPT/Puter calls.
- No remote script injection.
- No claim that review is performed until the runtime actually performs it.
- No enabled bridge without explicit opt-in tests and privacy text.

## Future Runtime Shape

1. Content script collects candidate terminology issues after translation.
2. User opts in from the popup or panel.
3. A local bridge module receives only the selected text snippets and target language.
4. The bridge returns suggestions, not automatic DOM writes.
5. User applies or ignores suggestions.

## Current Guards

- `npm test` verifies that the bridge is disabled by default and requires explicit opt-in before any request path can proceed.
- `npm run check:files` fails if runtime files reference `js.puter.com`, Puter globals/app identity keys, remote script tags, remote `importScripts`, or remote dynamic imports.
