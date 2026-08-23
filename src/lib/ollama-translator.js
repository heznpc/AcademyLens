(function initAcademyLensOllamaTranslator(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.AcademyLensOllamaTranslator = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function ollamaTranslatorFactory() {
  "use strict";

  const DEFAULT_ENDPOINT = "http://localhost:11434/v1/chat/completions";
  const DEFAULT_TIMEOUT_MS = 120000;
  const MAX_BATCH_ITEMS = 24;
  const MAX_BATCH_CHARACTERS = 6000;
  const NO_REASONING_PATTERN = /^(?:qwen3\.5|gemma4)(?::|$)/i;

  function positiveNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  }

  function normalizeContent(value) {
    const text = String(value || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();
    if (!text) return "";

    const fenced = text.match(/^```(?:text)?\s*([\s\S]*?)\s*```$/i);
    const unwrapped = fenced ? fenced[1].trim() : text;
    if (
      unwrapped.length >= 2 &&
      ((unwrapped.startsWith('"') && unwrapped.endsWith('"')) || (unwrapped.startsWith("“") && unwrapped.endsWith("”")))
    ) {
      return unwrapped.slice(1, -1).trim();
    }
    return unwrapped;
  }

  function responseTokenLimit(text) {
    const length = String(text || "").length;
    return Math.max(96, Math.min(1024, Math.ceil(length * 1.5)));
  }

  function batchResponseTokenLimit(texts) {
    const length = texts.reduce((total, text) => total + String(text || "").length, 0);
    return Math.max(192, Math.min(2048, Math.ceil(length * 1.75)));
  }

  function addReasoningControl(body, model) {
    if (NO_REASONING_PATTERN.test(model)) {
      body.reasoning_effort = "none";
    }
    return body;
  }

  function buildRequestBody(options = {}) {
    const model = String(options.model || "").trim();
    const targetLanguage = String(options.targetLanguage || "").trim();
    const text = String(options.text || "").trim();
    if (!model) throw new Error("Ollama model is required");
    if (!targetLanguage) throw new Error("Target language is required");
    if (!text) throw new Error("Translation text is required");

    const body = {
      model,
      messages: [
        {
          role: "system",
          content:
            "You translate English course text. Return only the translated text with no explanation, label, markdown fence, or quotation marks. Preserve every __AL_*__ placeholder exactly. Preserve code, URLs, product names, and API identifiers unless the target language convention requires otherwise."
        },
        {
          role: "user",
          content: `Target language: ${targetLanguage}\n\n${text}`
        }
      ],
      temperature: 0,
      stream: false,
      max_tokens: responseTokenLimit(text)
    };

    // AcademyLens translation turns are deliberately short. qwen3.5 must use
    // reasoning_effort=none for this path; gemma4 also needs it so its internal
    // reasoning does not consume the short response budget before final output.
    return addReasoningControl(body, model);
  }

  function buildBatchRequestBody(options = {}) {
    const model = String(options.model || "").trim();
    const targetLanguage = String(options.targetLanguage || "").trim();
    const texts = Array.isArray(options.texts) ? options.texts.map((text) => String(text).trim()) : [];
    if (!model) throw new Error("Ollama model is required");
    if (!targetLanguage) throw new Error("Target language is required");
    if (!texts.length || texts.some((text) => !text)) throw new Error("Translation texts are required");

    return addReasoningControl(
      {
        model,
        messages: [
          {
            role: "system",
            content:
              "You translate English course text. Return only one strict JSON array of translated strings in the same order and with exactly the same item count as the input array. Do not add explanation, labels, or markdown fences. Preserve every __AL_*__ placeholder exactly. Preserve code, URLs, product names, and API identifiers unless the target language convention requires otherwise."
          },
          {
            role: "user",
            content: `Target language: ${targetLanguage}\nInput JSON:\n${JSON.stringify(texts)}`
          }
        ],
        temperature: 0,
        stream: false,
        max_tokens: batchResponseTokenLimit(texts)
      },
      model
    );
  }

  function normalizeBatchContent(value, expectedCount) {
    const text = String(value || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const unwrapped = fenced ? fenced[1].trim() : text;
    let parsed;
    try {
      parsed = JSON.parse(unwrapped);
    } catch {
      throw new Error("Ollama returned an invalid translation batch");
    }
    const translations = Array.isArray(parsed)
      ? parsed
      : parsed && Array.isArray(parsed.translations)
        ? parsed.translations
        : null;
    if (!translations || translations.length !== expectedCount) {
      throw new Error("Ollama returned a mismatched translation batch");
    }
    const normalized = translations.map((item) => normalizeContent(item));
    if (normalized.some((item) => !item)) throw new Error("Ollama returned an empty batch translation");
    return normalized;
  }

  function chunkTexts(texts) {
    const chunks = [];
    let current = [];
    let currentLength = 0;
    for (const text of texts) {
      const length = String(text).length;
      if (current.length && (current.length >= MAX_BATCH_ITEMS || currentLength + length > MAX_BATCH_CHARACTERS)) {
        chunks.push(current);
        current = [];
        currentLength = 0;
      }
      current.push(text);
      currentLength += length;
    }
    if (current.length) chunks.push(current);
    return chunks;
  }

  function create(options = {}) {
    const fetchImpl =
      options.fetchImpl || (typeof fetch === "function" ? (url, requestOptions) => fetch(url, requestOptions) : null);
    const endpoint = options.endpoint || DEFAULT_ENDPOINT;
    const timeoutMs = positiveNumber(options.timeoutMs, DEFAULT_TIMEOUT_MS);
    const setTimeoutImpl = options.setTimeoutImpl || setTimeout;
    const clearTimeoutImpl = options.clearTimeoutImpl || clearTimeout;
    let requestChain = Promise.resolve();

    function assertReady() {
      if (!fetchImpl) throw new Error("Ollama translator unavailable");
    }

    function enqueue(task) {
      const next = requestChain.then(task, task);
      requestChain = next.catch(() => {});
      return next;
    }

    async function requestNow(body, signal) {
      if (signal && signal.aborted) {
        const aborted = new Error("Ollama request aborted");
        aborted.name = "AbortError";
        throw aborted;
      }
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (signal) signal.addEventListener("abort", abort, { once: true });
      const timeoutId = setTimeoutImpl(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        if (!response.ok) {
          let detail = "";
          try {
            const payload = await response.json();
            detail = payload && payload.error ? `: ${payload.error.message || payload.error}` : "";
          } catch {
            detail = "";
          }
          throw new Error(`Ollama request failed with ${response.status}${detail}`);
        }

        const payload = await response.json();
        return payload?.choices?.[0]?.message?.content;
      } catch (error) {
        if (controller.signal.aborted) {
          const aborted = new Error(signal && signal.aborted ? "Ollama request aborted" : "Ollama request timed out");
          aborted.name = "AbortError";
          throw aborted;
        }
        throw error;
      } finally {
        clearTimeoutImpl(timeoutId);
        if (signal) signal.removeEventListener("abort", abort);
      }
    }

    async function translateNow(text, targetLanguage, model, signal) {
      const content = await requestNow(buildRequestBody({ model, targetLanguage, text }), signal);
      const translated = normalizeContent(content);
      if (!translated) throw new Error("Ollama returned an empty translation");
      return translated;
    }

    async function translateBatchNow(texts, targetLanguage, model, signal) {
      const content = await requestNow(buildBatchRequestBody({ model, targetLanguage, texts }), signal);
      return normalizeBatchContent(content, texts.length);
    }

    function translateText(text, targetLanguage, model, signal) {
      assertReady();
      // The recommended Ollama server uses OLLAMA_NUM_PARALLEL=1 and
      // OLLAMA_MAX_LOADED_MODELS=1, so requests are serialized on the client too.
      return enqueue(() => translateNow(text, targetLanguage, model, signal));
    }

    function translateTexts(texts, targetLanguage, model, signal) {
      assertReady();
      const normalized = Array.isArray(texts) ? texts.map((text) => String(text).trim()).filter(Boolean) : [];
      if (!normalized.length) return Promise.resolve([]);
      return enqueue(async () => {
        if (normalized.length === 1) {
          return [await translateNow(normalized[0], targetLanguage, model, signal)];
        }
        const translated = [];
        for (const chunk of chunkTexts(normalized)) {
          translated.push(...(await translateBatchNow(chunk, targetLanguage, model, signal)));
        }
        return translated;
      });
    }

    return Object.freeze({ translateText, translateTexts });
  }

  return Object.freeze({
    DEFAULT_ENDPOINT,
    buildBatchRequestBody,
    buildRequestBody,
    chunkTexts,
    create,
    normalizeBatchContent,
    normalizeContent,
    responseTokenLimit
  });
});
