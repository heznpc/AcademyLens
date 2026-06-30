## What Changed?

<!-- Briefly describe the change. -->

## Type

- [ ] Bug fix
- [ ] Feature
- [ ] Glossary/i18n
- [ ] Documentation
- [ ] Test/QA
- [ ] Refactor
- [ ] Copy/assets

## Verification

- [ ] `npm run check:full` passes
- [ ] `npm run release:preflight` passes for release, store, fixture, provider/privacy, or glossary status changes
- [ ] Extension loads in Chrome developer mode
- [ ] Tested on `https://academy.openai.com/`
- [ ] No unexpected console errors
- [ ] Screenshots or notes included for UI changes

## Glossary Checklist

- [ ] Source keys are preserved unless intentionally adding a term
- [ ] Protected terms remain unchanged
- [ ] Important corrections have smoke checks
- [ ] Review status is not overstated

## Safety Checklist

- [ ] Keeps `Unofficial, not affiliated with OpenAI` positioning intact
- [ ] Does not add remote hosted runtime code
- [ ] Does not touch enrollment, progress, certificates, quizzes, accounts, or credentials
- [ ] Sanitizes any captured Academy/Gradual fixture
- [ ] Updates `docs/GLOSSARY_STATUS.md` when glossary metadata changes
- [ ] Updates `docs/LIVE_QA_MANIFEST.json` when Academy/Gradual surfaces change

## Copy / Asset Checklist

- [ ] Does not use official-sounding names such as `OpenAI Academy Lens`, `OpenAI Translator`, or `powered by OpenAI`
- [ ] Icon changes explain the visual direction and regenerate all manifest PNG sizes
- [ ] Store/README claims match implemented behavior and glossary metadata

## Related Issues

<!-- Closes #123 -->
