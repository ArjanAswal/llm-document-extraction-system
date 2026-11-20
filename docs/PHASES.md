# Verification checklist

Use this checklist before merging or releasing changes.

## Setup and build

- [ ] `npm install` succeeds.
- [ ] `npm run typecheck` succeeds.
- [ ] `npm run build` emits `dist/`.
- [ ] `.env.example` documents required variables.
- [ ] No secrets or generated build files are staged.

## Domain and data contract

- [ ] `src/domain/invoice.schema.ts` remains the source of truth for extracted fields.
- [ ] `CSV_COLUMNS` includes only intended output columns in the correct order.
- [ ] Domain code has no LangChain, Gemini, or language-detection imports.
- [ ] Normalizer and validator tests cover changed behavior.

## Pipeline and adapters

- [ ] The pipeline depends on ports from `src/ports/`.
- [ ] PDF extraction and language detection preserve the original text flow.
- [ ] LLM calls remain centralized in `src/services/invoice-extractor.ts`.
- [ ] Validation warnings are recorded without dropping rows.

## Tests and manual checks

- [ ] `npm test` passes.
- [ ] `npm run extract -- --input invoices --output output/extracted_invoices.csv` processes the sample PDFs.
- [ ] The generated CSV has one row per PDF and the expected headers.
- [ ] `npm run test:live` passes when intentionally testing the configured LLM API.

## Documentation

- [ ] README quickstart and scripts are current.
- [ ] Breaking CSV changes include a schema version update and migration note.
- [ ] New environment variables are documented in `.env.example`.
