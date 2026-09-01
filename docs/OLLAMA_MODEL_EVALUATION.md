# Ollama Model Evaluation

AcademyLens evaluates every configured Ollama model against 20 cases in
`scripts/fixtures/ollama-evaluation.json`: five cases each for Korean (`ko`), Japanese (`ja`), Spanish (`es`), and Simplified Chinese (`zh-CN`). Each case checks placeholder preservation, source leakage, the available target-language evidence, and expected course terminology.

The evaluator sends one five-item batch per target language. Its JSON output keeps `passed`, `total`, `score`, `validation`, and individual cases under a separate `languages[]` entry, so an aggregate model score cannot hide a failed language. Latin-script targets use conservative English-language evidence and copied-source phrase detection; they do not claim that Latin characters alone prove Spanish output.

Run the current evaluation with:

```bash
npm run test:ollama -- --out=/tmp/academylens-ollama-results.json
```

Use `--model=<name>` to evaluate one configured model. A model succeeds only when every case in every language succeeds. Re-run after changing prompts, models, Ollama, or hardware.

## Historical Korean-only baseline

Measured: 2026-08-24 KST

The previous evaluator used only the five Korean cases. On an Apple M4 with Ollama 0.32.3, a 4096-token context, one loaded model, parallelism 1, and keep-alive 0, it produced:

| Model              | Korean result |  Elapsed |
| ------------------ | ------------: | -------: |
| `gemma3:4b`        |           5/5 | 10.528 s |
| `qwen3.5:4b`       |           5/5 | 10.459 s |
| `qwen3.5:9b`       |           5/5 | 16.361 s |
| `aya-expanse:8b`   |           5/5 | 13.878 s |
| `qwen2.5-coder:7b` |           5/5 | 14.716 s |
| `gemma4:12b`       |           5/5 | 28.540 s |

Those 30 Korean translations passed the former corpus. They are not a result for the current four-language evaluator. Both `qwen3.5` models used `reasoning_effort: "none"` through the AcademyLens request builder.
