# Security Policy

## Reporting a Vulnerability

Do not open a public issue with vulnerability details.

If GitHub Private Vulnerability Reporting is available for this repository, use the repo's Security tab and choose "Report a vulnerability." If that is unavailable, use the `Security Disclosure Request` issue form with no vulnerability details; the maintainer will provide a private intake path.

## In Scope

- Content-script injection paths, including any translator output that could become executable HTML or script.
- Cross-origin or permission issues involving `academy.openai.com`, `translate.googleapis.com`, or extension storage.
- Bugs that send more page data to Google Translate than the documented visible-text translation scope.
- Bugs that read or modify OpenAI Academy enrollment, progress, certificate, account, or credential data.
- MV3 remote-code risk, including remote script loading or dynamic remote imports.
- Supply-chain issues in npm dependencies or GitHub Actions.

## Out of Scope

- Bugs in OpenAI Academy, OpenAI, Gradual, Google Translate, Chrome, or other third-party services.
- General translation quality issues; use the glossary or bug templates instead.
- Reports that require users to manually paste malicious content into developer tools or local files.
- Social engineering, spam, or denial-of-service reports against third-party services.

## Response Timeline

- Acknowledgement: within 72 hours when the report includes enough detail.
- Initial triage: within 7 days.
- Critical fixes: target within 14 days when practical.
- Public disclosure: coordinated after a fix is available.

AcademyLens is unofficial and not affiliated with OpenAI.
