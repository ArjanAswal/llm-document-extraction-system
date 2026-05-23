# Project invariants

These rules must not be violated without an explicit plan update and user approval.

## Data contract

- **Zod schema** (`src/domain/invoice.schema.ts`) is the single source of truth for extracted shape.
- CSV headers are fixed and ordered via `CSV_COLUMNS` in `src/domain/invoice.types.ts`.
- Breaking CSV changes require a schema version bump and README update.

## Multilingual handling

- **franc** detects language for metadata (`detected_language`, `language_confidence`) only.
- franc **never** modifies invoice text sent to the LLM and **never** triggers translation.
- Gemini reads multilingual input natively; structural normalization runs post-LLM in `normalizer.ts`.

## LLM boundary

- All Gemini / LangChain calls live in `src/services/invoice-extractor.ts` (one prompt owner).
- Prompts must instruct structural extraction, not document translation.

## Architecture

- Pipeline (`src/services/pipeline.ts`) depends on **port interfaces** in `src/ports/`, not concrete classes.
- Domain + validation (`src/domain/`) have **no** LangChain, Gemini, or franc imports.
- Normalization is deterministic (no LLM).

## Output behavior

- Pipeline never drops rows — validation issues are recorded in `validation_warnings`.
- Nullable fields render as empty CSV cells.
