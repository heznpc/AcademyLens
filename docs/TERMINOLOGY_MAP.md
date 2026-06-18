# OpenAI Academy Terminology Map

AcademyLens is positioned around multilingual community glossaries that connect OpenAI Academy course language with OpenAI documentation terminology.

This is not a claim of affiliation with OpenAI. The glossary uses public OpenAI Academy pages and OpenAI developer documentation as terminology references.

AcademyLens ships thirteen premium glossary packs: `de`, `es`, `fr`, `hi`, `id`, `it`, `ja`, `ko`, `pt-BR`, `ru`, `vi`, `zh-CN`, and `zh-TW`. Each pack carries 100+ OpenAI Academy/OpenAI Docs core terms across Academy learning, prompting, model concepts, agents, structured outputs, evaluation, course format, and safety. Korean is currently the first reviewed pack; the other premium packs are AI-drafted beta packs waiting for X translation cross-checks, community review, and native review. Hindi and French are first-class beta packs because OpenAI Academy already exposes India/Hindi content and French Academy events.

## Source Set

- OpenAI Academy course pages: `https://academy.openai.com/`, `https://academy.openai.com/pages/courses`
- Prompting: `https://developers.openai.com/api/docs/guides/prompt-engineering`
- Core model concepts: `https://developers.openai.com/api/docs/concepts`
- Text generation and response formats: `https://developers.openai.com/api/docs/guides/text`
- Structured Outputs: `https://developers.openai.com/api/docs/guides/structured-outputs`
- Agents: `https://developers.openai.com/api/docs/guides/agents`
- Guardrails and human review: `https://developers.openai.com/api/docs/guides/agents/guardrails-approvals`
- Observability and tracing: `https://developers.openai.com/api/docs/guides/agents/integrations-observability`
- Evaluation: `https://developers.openai.com/api/docs/guides/evaluation-best-practices`

## Academy To Docs Mapping

| Academy language              | OpenAI docs anchor                | Glossary direction             |
| ----------------------------- | --------------------------------- | ------------------------------ |
| clear instructions            | prompt engineering / instructions | 명확한 지시                    |
| useful or relevant context    | prompt engineering / context      | 유용한 컨텍스트, 관련 컨텍스트 |
| reviewing outputs             | text generation / outputs         | 출력 검토                      |
| repeatable ways of working    | agents / workflows                | 반복 가능한 업무 방식          |
| agents and workflows          | Agents SDK                        | 에이전트, 워크플로             |
| staying in control            | guardrails / human review         | 통제권 유지                    |
| structured work               | agents / orchestration / tools    | 구조화된 작업                  |
| practical AI skills           | Academy course positioning        | 실용 AI 역량                   |
| course completion certificate | Academy course credentialing      | 과정 수료증                    |

## Glossary Rules

- Product names and protocol/API terms stay protected: OpenAI, OpenAI Academy, ChatGPT, GPT, JSON, JSON Schema, Responses API, Agents SDK.
- Installed glossary corrections are applied before machine translation by placeholder masking.
- Premium languages use installed glossary corrections. The UI distinguishes reviewed packs from AI-drafted beta packs.
- Languages outside the premium glossary set use machine translation plus protected-term preservation.
- Every glossary term must include `category`, `sources`, and a short note explaining the translation choice.
- `npm run check:glossary` rejects duplicate terms, unknown source IDs, protected-term collisions, thin notes, stale registry metadata, missing premium locales, source-key drift across premium packs, and insufficient Academy/OpenAI-docs coverage.

## QA Signals

AcademyLens uses multiple evidence layers, each with a different job:

| Layer                     | Role                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| AI-assisted draft         | Create the first consistent multilingual terminology map.             |
| Google Translate baseline | Find terms where runtime machine translation likely needs help.       |
| X translation check       | Cross-check public, user-facing machine translations of OpenAI posts. |
| Official docs alignment   | Use official OpenAI English docs as canonical source anchors.         |
| Community/native review   | Improve fluency, register, and local technical convention.            |

X translation is not treated as an official OpenAI translation. It is a practical signal for how public machine translation renders OpenAI terminology in the wild.

Reviewers can generate locale-specific audit packets with `npm run glossary:audit`; see [GLOSSARY_AUDIT.md](GLOSSARY_AUDIT.md) and [X_TRANSLATION_CHECK.md](X_TRANSLATION_CHECK.md).

## Why This Matters

Generic page translators can translate words, but they do not know that OpenAI Academy repeatedly teaches a pathway from clear instructions and relevant context to review points, repeatable workflows, agents, guardrails, and evaluations. AcademyLens should make that path read consistently in every contributed language pack.
