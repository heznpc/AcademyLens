const PREMIUM_LOCALE_RECORDS = Object.freeze([
  Object.freeze({ locale: "de", language: "German", name: "German OpenAI Academy glossary", status: "llm-drafted" }),
  Object.freeze({ locale: "es", language: "Spanish", name: "Spanish OpenAI Academy glossary", status: "llm-drafted" }),
  Object.freeze({ locale: "fr", language: "French", name: "French OpenAI Academy glossary", status: "llm-drafted" }),
  Object.freeze({
    locale: "id",
    language: "Indonesian",
    name: "Indonesian OpenAI Academy glossary",
    status: "llm-drafted"
  }),
  Object.freeze({ locale: "it", language: "Italian", name: "Italian OpenAI Academy glossary", status: "llm-drafted" }),
  Object.freeze({
    locale: "ja",
    language: "Japanese",
    name: "Japanese OpenAI Academy glossary",
    status: "llm-drafted"
  }),
  Object.freeze({ locale: "ko", language: "Korean", name: "Korean OpenAI Academy glossary", status: "reviewed" }),
  Object.freeze({
    locale: "pt-BR",
    language: "Portuguese Brazil",
    name: "Brazilian Portuguese OpenAI Academy glossary",
    status: "llm-drafted"
  }),
  Object.freeze({ locale: "ru", language: "Russian", name: "Russian OpenAI Academy glossary", status: "llm-drafted" }),
  Object.freeze({
    locale: "vi",
    language: "Vietnamese",
    name: "Vietnamese OpenAI Academy glossary",
    status: "llm-drafted"
  }),
  Object.freeze({
    locale: "zh-CN",
    language: "Chinese Simplified",
    name: "Simplified Chinese OpenAI Academy glossary",
    status: "llm-drafted"
  }),
  Object.freeze({
    locale: "zh-TW",
    language: "Chinese Traditional",
    name: "Traditional Chinese OpenAI Academy glossary",
    status: "llm-drafted"
  })
]);

const PROTECTED_TERMS = Object.freeze([
  "OpenAI",
  "OpenAI Academy",
  "ChatGPT",
  "GPT",
  "GPT-5",
  "GPT-4",
  "LLM",
  "API",
  "SDK",
  "JSON",
  "JSON Schema",
  "Responses API",
  "Agents SDK",
  "Gradual",
  "Google Translate"
]);

const ALLOWED_GLOSSARY_STATUSES = Object.freeze([
  "llm-drafted",
  "llm-audited",
  "community-reviewed",
  "native-reviewed",
  "reviewed"
]);

const DRAFT_NOTE =
  "AI-drafted term rendering from OpenAI Academy and OpenAI developer documentation; pending X translation cross-check and community review.";

const QUALITY_SMOKE_TERMS = Object.freeze({
  de: Object.freeze({
    "human review": "menschliche Prüfung",
    "structured outputs": "strukturierte Ausgaben"
  }),
  es: Object.freeze({
    "agentic workflows": "flujos de trabajo con agentes",
    approvals: "aprobaciones",
    guardrails: "guardrails",
    "structured outputs": "salidas estructuradas"
  }),
  fr: Object.freeze({
    "clear instructions": "instructions claires",
    schema: "schéma",
    "structured outputs": "sorties structurées"
  }),
  id: Object.freeze({
    "agentic workflows": "alur kerja agentik",
    "structured outputs": "output terstruktur"
  }),
  it: Object.freeze({
    "human review": "revisione umana",
    "review point": "punto di revisione",
    schema: "schema",
    schemas: "schemi",
    "structured outputs": "output strutturati"
  }),
  ja: Object.freeze({
    prompt: "プロンプト",
    "structured outputs": "構造化出力"
  }),
  ko: Object.freeze({
    prompt: "프롬프트",
    "structured outputs": "구조화된 출력"
  }),
  "pt-BR": Object.freeze({
    "agentic workflows": "fluxos de trabalho com agentes",
    approvals: "aprovações",
    "human review": "revisão humana",
    repeatable: "repetível",
    "structured outputs": "saídas estruturadas"
  }),
  ru: Object.freeze({
    prompt: "промпт",
    trace: "трейс",
    "structured outputs": "структурированные выводы"
  }),
  vi: Object.freeze({
    "clear instructions": "chỉ dẫn rõ ràng",
    guardrails: "hàng rào bảo vệ",
    schema: "schema",
    "structured outputs": "đầu ra có cấu trúc"
  }),
  "zh-CN": Object.freeze({
    prompt: "提示词",
    "structured outputs": "结构化输出"
  }),
  "zh-TW": Object.freeze({
    agent: "智能體",
    prompt: "提示詞",
    schema: "結構描述",
    "structured outputs": "結構化輸出"
  })
});

module.exports = Object.freeze({
  ALLOWED_GLOSSARY_STATUSES,
  DRAFT_NOTE,
  PREMIUM_LOCALE_RECORDS,
  PROTECTED_TERMS,
  QUALITY_SMOKE_TERMS
});
