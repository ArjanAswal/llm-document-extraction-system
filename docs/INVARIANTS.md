# Project invariants

These rules protect the data contract and architecture and should only change with an explicit design decision.

## Data contract

- The Zod schema in `src/domain/invoice.schema.ts` is the single source of truth for the extracted shape.
- CSV headers are fixed and ordered through `CSV_COLUMNS` in `src/domain/invoice.types.ts`.
- Breaking CSV changes require a schema version bump and README update.

## Multilingual handling

- **franc** detects language for metadata (`detected_language`, `language_confidence`) only.
- franc never modifies invoice text sent to the LLM and never triggers translation.
- Gemini reads multilingual input natively; structural normalization runs after LLM extraction in `normalizer.ts`.

## LLM boundary

- All Gemini and LangChain calls live in `src/services/invoice-extractor.ts` as the single prompt owner.
- Prompts must request structural extraction rather than document translation.

## Architecture

- The pipeline in `src/services/pipeline.ts` depends on port interfaces in `src/ports/`, not concrete classes.
- The domain and validation code in `src/domain/` has no LangChain, Gemini, or franc imports.
- Normalization is deterministic and does not call an LLM.

## Output behavior

- The pipeline preserves every row; validation issues are recorded in `validation_warnings`.
- Nullable fields render as empty CSV cells.
