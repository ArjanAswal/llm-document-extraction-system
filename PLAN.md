# LLM Utility Invoice Extraction — Living Plan

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Meta layer (rules, invariants, gates) | complete |
| 1 | Bootstrap (TypeScript, Vitest) | complete |
| 2 | Domain (schema, normalizer, validator, ports) | complete |
| 3 | Services + CLI (pipeline, CSV output) | complete |
| 4 | Documentation + deliverables | complete |

## Objective

Extract structured utility-invoice fields from multilingual PDFs using Gemini 3.1 Flash-Lite Preview, LangChain, and Zod; output CSV with bonus metadata (language detection, confidence scoring, validation warnings).

## Key docs

- [README.md](README.md) — quickstart and architecture
- [TESTING.md](TESTING.md) — validation approach
- [Invariants](docs/INVARIANTS.md)
- [Commit conventions](docs/COMMITS.md)
- [Phase gates](docs/PHASES.md)
- [Video outline](docs/VIDEO_OUTLINE.md)

## Pipeline flow

```
PDF ? text ? franc (metadata) ? Gemini extract ? normalize ? validate ? CSV
```
