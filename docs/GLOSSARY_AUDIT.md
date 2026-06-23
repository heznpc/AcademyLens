# Glossary Audit Workflow

AcademyLens glossary packs are useful only when reviewers can find mistakes quickly. The repo includes an audit packet generator for AI review, native review, and community review.

## Generate Audit Packets

```bash
npm run glossary:audit
npm run glossary:audit -- --locale=ja
```

The command writes Markdown and JSON packets to `dist/glossary-audit/`. The folder is ignored by git.

Each packet includes:

- every source/target pair for the locale
- source IDs used for the term
- review flags such as `single-word-overreach-risk`, `latin-target-review`, and `target-same-as-source`
- protected-term collision checks

## Review Priorities

1. Check `single-word-overreach-risk` terms first. Short words such as `model`, `module`, `lesson`, and `examples` can over-apply in normal course prose.
2. Check terms with Latin text in the target language. Some are intentional, such as `JSON mode`, but others may be lazy transliteration.
3. Compare high-impact terms against OpenAI Academy pages and OpenAI developer documentation.
4. For `llm-drafted` packs, mark issues without promoting the pack status.
5. Promote a pack only after native/community review or a documented review process.

## Status Meanings

- `llm-drafted`: AI-assisted draft. Good enough for beta correction, not enough to claim native quality.
- `llm-audited`: A second AI review pass has been applied and recorded.
- `community-reviewed`: Reviewed by a contributor with language knowledge.
- `native-reviewed`: Reviewed by a native or near-native speaker.
- `reviewed`: Final project-maintainer status after review evidence is complete; community-reviewed packs remain below this level until pending QA signals are closed.

## Over-Translation Smoke Check

```bash
npm run check:glossary-overreach
```

This script runs selected Academy/Gradual fixture text through the glossary masker and fails if glossary placeholders become suspiciously dense. It is not a substitute for manual DOM QA, but it catches the most obvious "the dictionary got too aggressive" regressions.
