# Project roadmap

## Objective

Extract structured utility-invoice fields from multilingual PDFs using Gemini, LangChain, and Zod, then write the normalized records to CSV.

## Current capabilities

- Extract text from text-based PDFs.
- Detect invoice language as metadata.
- Extract structured invoice fields with Gemini.
- Normalize dates, utility types, and units.
- Record validation warnings without dropping rows.
- Export stable, ordered CSV columns.

## Roadmap

- Add OCR support for scanned PDFs.
- Add golden-file regression tests for extraction output.
- Add labeled evaluation data and field-level quality metrics.
- Calibrate confidence scores and add a retry policy.
- Add additional output adapters such as JSON.
- Add optional CI coverage for live API smoke tests.

## Project documentation

- [README.md](README.md) — quickstart and architecture
- [TESTING.md](TESTING.md) — validation strategy and test suite
- [docs/INVARIANTS.md](docs/INVARIANTS.md) — architecture and data contracts
- [docs/COMMITS.md](docs/COMMITS.md) — commit conventions
- [docs/PHASES.md](docs/PHASES.md) — release verification checklist

## Pipeline flow

```text
PDF → text → franc metadata → Gemini extraction → normalize → validate → CSV
```
