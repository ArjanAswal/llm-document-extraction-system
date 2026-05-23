# LLM Utility Invoice Extraction — Living Plan

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Meta layer (rules, invariants, gates) | in progress |
| 1 | Bootstrap (TypeScript, Vitest) | pending |
| 2 | Domain (schema, normalizer, validator, ports) | pending |
| 3 | Services + CLI (pipeline, CSV output) | pending |
| 4 | Documentation + deliverables | pending |

## Objective

Extract structured utility-invoice fields from multilingual PDFs using Gemini 3.1 Flash-Lite Preview, LangChain, and Zod; output CSV with bonus metadata (language detection, confidenceRows confidence, validation warnings).

## Key docs

- [Invariants](docs/INVARIANTS.md)
- [Commit conventions](docs/COMMITS.md)
- [Phase gates](docs/PHASES.md)

## Assumptions

- PDF text via `pdf-parse` (no OCR)
- `GOOGLE_API_KEY` for Gemini API
- Missing fields ? null / empty CSV cells
- franc is metadata-only; no translation layer

## Pipeline flow

```
PDF ? text ? franc (metadata) ? Gemini extract ? normalize ? validate ? CSV
```
