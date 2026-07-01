const PREMIUM_LOCALE_RECORDS = Object.freeze([
  Object.freeze({ locale: "de", language: "German", name: "German OpenAI Academy glossary", status: "llm-audited" }),
  Object.freeze({ locale: "es", language: "Spanish", name: "Spanish OpenAI Academy glossary", status: "llm-audited" }),
  Object.freeze({ locale: "fr", language: "French", name: "French OpenAI Academy glossary", status: "llm-audited" }),
  Object.freeze({ locale: "hi", language: "Hindi", name: "Hindi OpenAI Academy glossary", status: "llm-audited" }),
  Object.freeze({
    locale: "id",
    language: "Indonesian",
    name: "Indonesian OpenAI Academy glossary",
    status: "llm-audited"
  }),
  Object.freeze({ locale: "it", language: "Italian", name: "Italian OpenAI Academy glossary", status: "llm-audited" }),
  Object.freeze({
    locale: "ja",
    language: "Japanese",
    name: "Japanese OpenAI Academy glossary",
    status: "llm-audited"
  }),
  Object.freeze({
    locale: "ko",
    language: "Korean",
    name: "Korean OpenAI Academy glossary",
    status: "community-reviewed"
  }),
  Object.freeze({
    locale: "pt-BR",
    language: "Portuguese Brazil",
    name: "Brazilian Portuguese OpenAI Academy glossary",
    status: "llm-audited"
  }),
  Object.freeze({ locale: "ru", language: "Russian", name: "Russian OpenAI Academy glossary", status: "llm-audited" }),
  Object.freeze({
    locale: "vi",
    language: "Vietnamese",
    name: "Vietnamese OpenAI Academy glossary",
    status: "llm-audited"
  }),
  Object.freeze({
    locale: "zh-CN",
    language: "Chinese Simplified",
    name: "Simplified Chinese OpenAI Academy glossary",
    status: "llm-audited"
  }),
  Object.freeze({
    locale: "zh-TW",
    language: "Chinese Traditional",
    name: "Traditional Chinese OpenAI Academy glossary",
    status: "llm-audited"
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
    "AI literacy": "KI-Grundkompetenz",
    "agentic workflows": "agentenbasierte Workflows",
    grounding: "Kontextverankerung",
    guardrail: "Leitplanke",
    handoff: "Übergabe",
    "human review": "menschliche Prüfung",
    "review checkpoint": "Prüfpunkt",
    "red teaming": "Red-Teaming",
    "structured outputs": "strukturierte Ausgaben"
  }),
  es: Object.freeze({
    "agentic workflows": "flujos de trabajo con agentes",
    approvals: "aprobaciones",
    "few-shot prompting": "prompting con pocos ejemplos",
    grounding: "anclaje contextual",
    guardrails: "salvaguardas",
    "hands-on practice": "práctica aplicada",
    "large language model": "modelo de lenguaje de gran tamaño",
    "red teaming": "pruebas de red team",
    "structured outputs": "salidas estructuradas"
  }),
  fr: Object.freeze({
    "agentic workflows": "flux de travail avec agents",
    "clear instructions": "instructions claires",
    "course completion certificate": "certificat d’achèvement du cours",
    "few-shot prompting": "prompting avec quelques exemples",
    "human review": "validation humaine",
    "red teaming": "tests red team",
    schema: "schéma",
    "structured outputs": "sorties structurées",
    workflow: "flux de travail"
  }),
  hi: Object.freeze({
    "AI fluency": "AI उपयोग दक्षता",
    eval: "मूल्यांकन",
    guardrails: "गार्डरेल",
    "human review": "मानवीय समीक्षा",
    "large language model": "विशाल भाषा मॉडल",
    prompt: "प्रॉम्प्ट",
    "review outputs": "आउटपुट की समीक्षा",
    "structured outputs": "संरचित आउटपुट",
    "task decomposition": "कार्य विभाजन",
    "use case": "उपयोग परिदृश्य"
  }),
  id: Object.freeze({
    "AI fluency": "kemahiran menggunakan AI",
    "agentic workflows": "alur kerja berbasis agen",
    "golden dataset": "dataset acuan",
    grounding: "pijakan konteks",
    guardrails: "mekanisme pengaman",
    handoff: "serah-terima",
    output: "keluaran",
    "red teaming": "uji tim merah",
    "structured outputs": "keluaran terstruktur"
  }),
  it: Object.freeze({
    "agentic workflows": "flussi di lavoro basati su agenti",
    guardrails: "salvaguardie",
    handoff: "passaggio di consegne",
    "human review": "revisione umana",
    "prompt engineering": "ingegneria dei prompt",
    "red teaming": "test red team",
    "review point": "punto di revisione",
    rubric: "griglia di valutazione",
    schema: "schema",
    schemas: "schemi",
    "structured outputs": "output strutturati",
    trace: "traccia"
  }),
  ja: Object.freeze({
    "AI fluency": "AI活用力",
    eval: "eval",
    guardrails: "ガードレール",
    "human review": "人によるレビュー",
    prompt: "プロンプト",
    "repeatable ways of working": "繰り返し使える仕事の進め方",
    "schema validation": "スキーマ検証",
    "sensitive data": "機微データ",
    "staying in control": "主導権を保つ",
    "structured outputs": "構造化出力"
  }),
  ko: Object.freeze({
    prompt: "프롬프트",
    "structured outputs": "구조화된 출력"
  }),
  "pt-BR": Object.freeze({
    "agentic workflows": "fluxos de trabalho com agentes",
    approvals: "aprovações",
    "golden dataset": "conjunto de dados padrão-ouro",
    grounding: "ancoragem contextual",
    guardrails: "salvaguardas",
    handoff: "transferência",
    "human review": "revisão humana",
    "large language model": "modelo de linguagem de grande porte",
    "red teaming": "testes de red team",
    repeatable: "repetível",
    rubric: "rubrica de avaliação",
    "structured outputs": "saídas estruturadas"
  }),
  ru: Object.freeze({
    "AI fluency": "уверенное владение ИИ",
    guardrails: "защитные ограничения",
    "human review": "проверка человеком",
    "large language model": "большая языковая модель",
    prompt: "промпт",
    "red teaming": "редтиминг",
    "review outputs": "проверка выходных данных",
    trace: "трейс",
    "structured outputs": "структурированные выходные данные",
    "tool call": "вызов инструмента"
  }),
  vi: Object.freeze({
    "AI fluency": "khả năng sử dụng AI thành thạo",
    "AI literacy": "hiểu biết cơ bản về AI",
    "clear instructions": "chỉ dẫn rõ ràng",
    delegate: "giao việc cho AI",
    eval: "đánh giá",
    guardrails: "cơ chế bảo vệ",
    "handoff target": "đích bàn giao",
    "red teaming": "kiểm thử đội đỏ",
    rubric: "bảng tiêu chí đánh giá",
    schema: "schema",
    "structured outputs": "đầu ra có cấu trúc",
    trace: "dấu vết"
  }),
  "zh-CN": Object.freeze({
    "course completion certificate": "课程结业证书",
    grounding: "依据锚定",
    prompt: "提示词",
    prompting: "提示词编写",
    schema: "架构",
    "schema validation": "架构验证",
    "strict schema": "严格架构",
    "structured outputs": "结构化输出",
    token: "词元"
  }),
  "zh-TW": Object.freeze({
    agent: "智能體",
    "course completion certificate": "課程結業證書",
    grounding: "依據錨定",
    prompt: "提示詞",
    prompting: "提示詞編寫",
    schema: "結構描述",
    "strict schema": "嚴格的結構描述",
    "structured outputs": "結構化輸出",
    token: "詞元"
  })
});

module.exports = Object.freeze({
  ALLOWED_GLOSSARY_STATUSES,
  DRAFT_NOTE,
  PREMIUM_LOCALE_RECORDS,
  PROTECTED_TERMS,
  QUALITY_SMOKE_TERMS
});
