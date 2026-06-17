# Glossary Audit Packets

AcademyLens keeps broad multilingual glossary drafts, but only reviewed evidence should raise a pack above `llm-drafted`.

Generate Claude-ready audit packets with:

```bash
npm run glossary:audit-packets
```

This writes:

- `dist/glossary-audit-packets/README.md`
- `dist/glossary-audit-packets/audit-<locale>.md`
- `dist/glossary-audit-packets/manifest.json`
- `dist/academy-lens-glossary-audit-packets.zip`

Each locale packet contains the full prompt, target glossary JSON, glossary registry snapshot, protected terms, current smoke terms, and a Korean quality-bar sample. The packet asks the auditor to return valid JSON only, so accepted changes can be applied deliberately instead of copied from prose.

## Review Flow

1. Run `npm run glossary:audit-packets`.
2. Upload the relevant `audit-<locale>.md` file, or the generated zip, to Claude.
3. Accept only patch entries that improve technical correctness or local naturalness.
4. Keep AI-audited packs at `llm-audited`; do not mark them `reviewed`.
5. Add high-signal `smokeTermsToAdd` entries to `scripts/lib/glossary-config.js`.
6. Run:

```bash
npm run glossary:seed
npm run check:full
```

The audit packet is a second-model quality gate, not an official OpenAI review and not a substitute for native/community review.
