# LLM Utility Invoice Extraction

Extract structured data from multilingual utility invoices (electricity, gas, water) using **Gemini 3.1 Flash-Lite Preview**, **LangChain**, and **Zod**, and output results as CSV.

## Quickstart

```bash
npm install
cp .env.example .env   # add GOOGLE_API_KEY
npm run extract -- --input invoices --output output/extracted_invoices.csv
npm test
```

### Environment variables

| Variable         | Required | Default                         |
| ---------------- | -------- | ------------------------------- |
| `GOOGLE_API_KEY` | Yes      | —                               |
| `GEMINI_MODEL`   | No       | `gemini-3.1-flash-lite-preview` |

## Architecture

```mermaid
flowchart LR
  PDF[invoices/*.pdf] --> Extract[pdf-parse]
  Extract --> Franc[franc metadata]
  Extract --> LLM[Gemini via LangChain]
  LLM --> Norm[normalizer]
  Norm --> Valid[validator]
  Valid --> CSV[csv-writer]
  Franc --> CSV
```

**Pipeline order:** `text → language detect → LLM extract → normalize → validate → CSV`

## Assumptions

| Assumption                                | Rationale                                |
| ----------------------------------------- | ---------------------------------------- |
| Text extracted via `pdf-parse` (no OCR)   | Fixtures are text-based PDFs             |
| Missing or ambiguous fields → empty cells | Nullable Zod fields                      |
| Dates normalized to ISO 8601              | Consistent downstream use                |
| No translation layer                      | Gemini reads multilingual text natively  |
| franc is metadata-only                    | Debugging enrichment, not transformation |

## Multilingual handling

- **Extraction:** Gemini parses English, Spanish, French, and UK English layouts without translating the document.
- **Detection:** `franc` adds `detected_language` and `language_confidence` to CSV for debugging.
- **Normalization:** `normalizer.ts` maps dates, units, and utility-type synonyms post-LLM (for example, `agua` → `water`).

## Features

### Language detection and normalization

- franc → ISO 639-1 in `language-detector.ts`
- Structural normalization in `normalizer.ts` (dates, units, utility types)
- Vendor and address preserved as printed

### Confidence metadata

- `extraction_confidence` — LLM self-score for the whole record
- `field_confidence` — per-field JSON scores from the LLM
- `language_confidence` — franc top-2 score heuristic
- `low_extraction_confidence` warning when the score is below `0.5`

### Validation checks

Cross-field rules in `invoice.validator.ts`:

| Code                     | Rule                             |
| ------------------------ | -------------------------------- |
| `invalid_billing_period` | start > end                      |
| `negative_usage`         | usage < 0                        |
| `future_invoice_date`    | date > tomorrow                  |
| `missing_required_field` | null usage, unit, or address     |
| `unit_type_mismatch`     | for example, gas paired with kWh |

Warnings appear in `validation_warnings` (semicolon-separated). Rows are never dropped.

### Modular design

Port interfaces in `src/ports/`:

- `TextExtractorPort` — swap in an OCR adapter
- `LanguageDetectorPort` — swap the detection library
- `InvoiceExtractorPort` — swap the LLM provider
- `OutputWriterPort` — add JSON or another output format

The pipeline accepts injected dependencies through `resolvePipelineDeps()`; see `tests/services/pipeline.test.ts`.

## Project structure

```text
src/
  ports/          # interfaces
  domain/         # schema, normalizer, validator
  services/       # adapters and pipeline
  cli/extract.ts  # CLI entry point
invoices/         # sample PDFs
output/           # generated CSV
tests/            # Vitest suite
```

## Scripts

| Command             | Description                               |
| ------------------- | ----------------------------------------- |
| `npm run extract`   | Run extraction pipeline                   |
| `npm test`          | Unit and integration tests (mocked LLM)   |
| `npm run test:live` | Live Gemini smoke test (requires API key) |
| `npm run build`     | Compile TypeScript to `dist/`             |

## Testing approach

The default Vitest suite requires no API key and combines automated checks with manual spot-checks against the sample PDFs.

### Accuracy validation

- **Zod schemas** enforce field types, utility enums, and ISO dates before rows are written.
- **`invoice.validator.ts`** adds cross-field checks for billing period order, unit compatibility, negative usage, and missing fields.
- **`validation_warnings`** identifies rows needing review without dropping them.
- Manual checks compare `output/extracted_invoices.csv` with the five sample PDFs in `invoices/`.

| Sample                                        | Key checks                         | Expected result                                |
| --------------------------------------------- | ---------------------------------- | ---------------------------------------------- |
| `invoice_01_electricity_us_clean.pdf`         | 663 kWh, Mar 15 2024, Pacific Grid | Matches                                        |
| `invoice_02_gas_uk_missing_fields.pdf`        | 243 therms, no billing end date    | Empty `billing_period_end`                     |
| `invoice_03_agua_espanol_ambiguous.pdf`       | 23 m³ water, Spanish, Enero 2024   | Matches                                        |
| `invoice_04_electricite_francais_missing.pdf` | 417 kWh, no invoice date           | Empty `invoice_date` with a validation warning |
| `invoice_05_water_us_ambiguous.pdf`           | 18 CCF, no billing start date      | Empty `billing_period_start`                   |

Regenerate and re-check the CSV with:

```bash
npm run extract -- --input invoices --output output/extracted_invoices.csv
```

### Test coverage

| Suite           | Scope                                                    |
| --------------- | -------------------------------------------------------- |
| Schema          | Valid and invalid rows, nullable fields                  |
| Normalizer      | Dates, units, and multilingual utility synonyms          |
| Validator       | Cross-field rules and warning codes                      |
| PDF             | Text extraction from a sample PDF                        |
| Language        | franc metadata for multilingual invoices                 |
| Extractor shape | LLM output schema and confidence metadata                |
| Pipeline        | End-to-end behavior with a mocked LLM and injected ports |
| Live optional   | One real Gemini call when `GOOGLE_API_KEY` is configured |

Covered edge cases include missing dates and fields, US/EU date formats, unit variants (kWh, therms, m³, CCF), ambiguous usage, empty PDF text, and mocked LLM variability.

```bash
npm test              # mocked suite (CI-friendly)
npm run test:live     # optional live API smoke test
```

## Roadmap

- Add OCR support for scanned PDFs.
- Add golden-file regression tests for extraction output.
- Add labeled evaluation data and field-level quality metrics.
- Calibrate confidence scores and add a retry policy.
- Add output adapters such as JSON.
- Add a gated CI job for live API smoke tests.

## Current limitations

- Confidence scores are LLM self-assessments rather than calibrated metrics.
- Strict parsing falls back to lenient normalization when needed.
- PDF extraction currently requires text-based PDFs; OCR is not included.
- CI uses a mocked LLM; live API testing is optional.

## See also

- [AGENTS.md](AGENTS.md) — repository and contribution guidelines
