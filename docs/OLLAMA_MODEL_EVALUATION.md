# Ollama Model Evaluation

Measured: 2026-08-24 KST

AcademyLens ran the five-case Korean evaluation corpus in `scripts/fixtures/ollama-evaluation.json` through Ollama's real OpenAI-compatible API. The corpus checks target-script output, protected placeholder preservation, source leakage, and expected course terminology.

## Environment

- Hardware: Apple M4, 11.8 GiB available unified memory reported by Ollama
- Ollama: 0.32.3
- Context: 4096
- Loaded models: 1
- Parallel requests: 1
- Keep alive: 0
- Each elapsed time includes model loading and one five-item batch because models unload after each evaluation.

## Results

| Model              | Result |  Elapsed |
| ------------------ | -----: | -------: |
| `gemma3:4b`        |    5/5 | 10.528 s |
| `qwen3.5:4b`       |    5/5 | 10.459 s |
| `qwen3.5:9b`       |    5/5 | 16.361 s |
| `aya-expanse:8b`   |    5/5 | 13.878 s |
| `qwen2.5-coder:7b` |    5/5 | 14.716 s |
| `gemma4:12b`       |    5/5 | 28.540 s |

All 30 translations passed. Both `qwen3.5` models used `reasoning_effort: "none"` through the AcademyLens request builder.

These results are a compact release regression signal, not a general translation-quality benchmark. Run `npm run test:ollama -- --out=/tmp/academylens-ollama-results.json` again after changing prompts, models, Ollama, or hardware.
