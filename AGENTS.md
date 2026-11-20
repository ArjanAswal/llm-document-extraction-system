# Repository Guidelines

## Engineering Standards

- Use strict TypeScript and keep changes small and focused.
- Match the existing naming conventions and module boundaries.
- Never commit `.env` files, API keys, or generated `dist/` output.
- Run the relevant tests and type checks before completing changes.

## Architecture

- The Zod schema in `src/domain/invoice.schema.ts` is the source of truth for extracted data.
- Keep CSV headers fixed and ordered through `CSV_COLUMNS` in `src/domain/invoice.types.ts`.
- Keep all Gemini and LangChain calls in `src/services/invoice-extractor.ts`.
- Make the pipeline depend on interfaces in `src/ports/`, not concrete services.
- Keep `src/domain/` free of LangChain, Gemini, and franc imports.
- Keep normalization deterministic and outside the LLM boundary.
- Treat `docs` as project documentation, not a second source of agent instructions.

## Multilingual and Output Behavior

- Use franc only for language metadata (`detected_language`, `language_confidence`). Never translate or modify LLM input based on its result.
- Gemini reads multilingual input natively; prompts request structural extraction, not translation.
- Preserve every row when validation fails and record issues in `validation_warnings`.
- Render nullable fields as empty CSV cells.
- Treat breaking CSV changes as data-contract changes requiring a schema version bump and README update.

## Commit Conventions

Use Conventional Commits with the format `<type>(<scope>): <short description>`.

Common types are `chore`, `docs`, `feat`, `fix`, `refactor`, and `test`. Suggested scopes are `domain`, `services`, `cli`, `ports`, `tests`, `docs`, or `deps`.

- Keep each commit focused on one logical change where practical.
- Never commit `.env` files, API keys, or generated build output.
- Write the summary in the imperative mood and keep it concise.

## Verification

Before merging or releasing changes:

- Run `npm run typecheck`, `npm test`, and `npm run build`.
- Run the extraction command when pipeline or CSV behavior changes; verify one row per sample PDF and the expected headers.
- Run `npm run test:live` only when intentionally testing the configured Gemini API key.
- Keep `.env.example` current when environment variables change.
- Update README and `TESTING.md` when behavior, commands, or validation coverage changes.
- Ensure no secrets or generated build files are staged.

## Commands

```bash
npm install
npm run typecheck
npm test
npm run build
npm run extract -- --input invoices --output output/extracted_invoices.csv
```
