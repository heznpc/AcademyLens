# X Translation Cross-Check

X translation is not an official OpenAI translation source. AcademyLens uses it only as a public, real-world machine-translation signal for OpenAI terminology.

## When To Use It

Use X cross-checks for terms where public OpenAI language is likely to appear repeatedly:

- product and API terms such as `Responses API`, `Agents SDK`, `structured outputs`, and `function calling`
- safety and governance terms such as `guardrails`, `human review`, `privacy`, and `red teaming`
- learning terms such as `AI literacy`, `hands-on practice`, and `workplace AI`

Do not treat an X-rendered phrase as authoritative. It can support a glossary decision, but it cannot replace OpenAI docs, Academy context, or native review.

## Manual Workflow

1. Find a public post from an official OpenAI account or a clearly relevant OpenAI employee account.
2. Record the original English phrase and the X-rendered translation.
3. Compare it to the current `src/data/glossary.<locale>.json` target.
4. Mark one of:
   - `matches-glossary`
   - `better-than-glossary`
   - `worse-than-glossary`
   - `ambiguous`
5. Open a glossary issue or PR only when the X signal is supported by docs, Academy context, or reviewer judgment.

## Evidence Format

Use this in issues or PR notes:

```text
locale:
source term:
current target:
X-rendered target:
post URL:
assessment: matches-glossary | better-than-glossary | worse-than-glossary | ambiguous
review note:
```

## Guardrails

- Do not scrape private accounts or logged-in-only material into the repo.
- Do not commit screenshots with personal account data.
- Do not say "OpenAI officially translates this as ..." unless the source is an official OpenAI translation page.
- Keep `xTranslationCheck` as `pending` until the review is documented.
