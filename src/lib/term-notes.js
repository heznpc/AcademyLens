(function initAcademyLensTermNotes(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.AcademyLensTermNotes = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function termNotesFactory() {
  "use strict";

  // AcademyLens explanations, paraphrased from the linked references. These
  // are not official quotations or the editorial notes in translation glossaries.
  const SOURCES = Object.freeze({
    concepts: { title: "OpenAI: Key concepts", url: "https://developers.openai.com/api/docs/concepts" },
    prompting: { title: "OpenAI: Prompt engineering", url: "https://developers.openai.com/api/docs/guides/prompt-engineering" },
    embeddings: { title: "OpenAI: Vector embeddings", url: "https://developers.openai.com/api/docs/guides/embeddings" },
    functions: { title: "OpenAI: Function calling", url: "https://developers.openai.com/api/docs/guides/function-calling" },
    structured: { title: "OpenAI: Structured outputs", url: "https://developers.openai.com/api/docs/guides/structured-outputs" },
    evaluation: { title: "OpenAI: Evaluation best practices", url: "https://developers.openai.com/api/docs/guides/evaluation-best-practices" }
  });
  const NOTES = [
    ["large language model", ["large language models", "LLM", "LLMs"], "A model trained on large amounts of text to process and generate language. Fluent output can still contain errors.", "concepts"],
    ["token", ["tokens"], "A unit used to represent text for a model. A token can be a word, part of a word, or punctuation; token boundaries vary by language.", "concepts"],
    ["context window", ["context windows"], "The amount of information a model can process within one request, measured in tokens. It limits how much input and generated content fit together.", "concepts"],
    ["model", ["models"], "A trained system that produces outputs from inputs. Models differ in their supported tasks, capabilities, speed, and cost.", "concepts"],
    ["generative pre-trained transformer", ["generative pretrained transformer", "GPT"], "A name used for a family of text-generation models. Such models process a prompt and generate a response for tasks such as writing, coding, or summarizing.", "concepts"],
    ["prompt", ["prompts"], "The input that tells a model what task to perform and provides the information it needs. Clear instructions help guide its response.", "prompting"],
    ["prompt engineering", [], "Designing instructions, examples, and context to make a model's responses more useful and reliable for a task.", "prompting"],
    ["few-shot learning", ["few-shot prompting", "few shot prompting"], "Including a few examples in a prompt to show the desired behavior or output format, without retraining the model.", "prompting"],
    ["retrieval-augmented generation", ["retrieval augmented generation", "RAG"], "Supplying relevant retrieved information as context for generation. The model can use this material, but its response still needs verification.", "prompting"],
    ["embedding", ["embeddings", "vector embedding", "vector embeddings"], "A numerical representation of content used to compare relatedness. Embeddings support tasks such as semantic search and grouping similar items.", "embeddings"],
    ["semantic search", [], "Finding information by meaning or relatedness rather than relying only on exact keyword matches. Embeddings are one way to support this.", "embeddings"],
    ["function calling", ["tool calling"], "A model requests a function using structured arguments. Application code executes the function and can return the result to the model.", "functions"],
    ["tool", ["tools"], "A capability an application makes available to a model, such as retrieving information or running a function. Access depends on the application's implementation.", "functions"],
    ["structured output", ["structured outputs", "JSON Schema"], "Output constrained to a defined format or schema. A valid structure helps software process the result but does not guarantee factual correctness.", "structured"],
    ["evaluation", ["evaluations", "eval", "evals"], "Checking model behavior against representative tasks and explicit criteria. Repeated evaluations help identify regressions and compare changes.", "evaluation"]
  ].map(([term, aliases, definition, source]) => Object.freeze({
    term,
    aliases: Object.freeze(aliases),
    definition,
    source: Object.freeze(SOURCES[source])
  }));

  function findNotes(original) {
    const text = String(original || "").slice(0, 6000);
    return NOTES.map((note) => {
      const matches = [note.term, ...note.aliases].filter((phrase) => {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`\\b${escaped}\\b`, "i").test(text);
      });
      return { note, specificity: Math.max(0, ...matches.map((phrase) => phrase.length)) };
    }).filter((match) => match.specificity > 0)
      .sort((left, right) => right.specificity - left.specificity)
      .slice(0, 5)
      .map((match) => match.note);
  }

  return Object.freeze({ NOTES: Object.freeze(NOTES), findNotes });
});
