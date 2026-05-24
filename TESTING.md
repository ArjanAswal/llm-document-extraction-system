# Testing approach

This document satisfies the assignment **Testing Approach** deliverable. A short summary also appears in [README.md](README.md#testing-approach).

---

## 1. How we validated accuracy of extracted fields

Validation used **two layers**: automated checks plus manual review against source PDFs.

### Manual spot-check (ground truth = PDF text)

Each of the five fixtures was opened as PDF text (`pdf-parse`) and compared to `output/extracted_invoices.csv`:

| File | Key checks | Result |
|------|------------|--------|
| `invoice_01_electricity_us_clean.pdf` | 663 kWh, Mar 15 2024, Pacific Grid | Matches |
| `invoice_02_gas_uk_missing_fields.pdf` | 243 therms, no billing end date | Matches (empty `billing_period_end`) |
| `invoice_03_agua_espanol_ambiguous.pdf` | 23 m³ water, Spanish, Enero 2024 | Matches |
| `invoice_04_electricite_francais_missing.pdf` | 417 kWh, no invoice date on bill | Matches (empty `invoice_date`, warning set) |
| `invoice_05_water_us_ambiguous.pdf` | 18 CCF, no billing start on bill | Matches (empty `billing_period_start`) |

Regenerate and re-check: `npm run extract -- --input invoices --output output/extracted_invoices.csv`

### Automated structural validation

- **Zod schemas** enforce types, enums (`electricity` / `gas` / `water`), and ISO dates before rows are written.
- **`invoice.validator.ts`** adds cross-field rules (billing period order, unit vs utility type, missing fields).
- **Warnings** in `validation_warnings` flag rows that need human review without dropping them.

---

## 2. Test cases and edge cases considered

| Edge case | Fixture / test | Expected behavior |
|-----------|----------------|-------------------|
| **Missing fields** | `invoice_02` (no end date), `invoice_05` (no start date) | Empty CSV cells |
| **Missing invoice date** | `invoice_04` (French; date not printed) | Empty `invoice_date` + `missing_required_field` |
| **Different languages** | `invoice_03` (ES), `invoice_04` (FR) | Gemini extracts without translation; `detected_language` = `es` / `fr` |
| **US vs EU date formats** | `normalizer.test.ts` | MM/DD vs DD/MM ? ISO `YYYY-MM-DD` |
| **Unit variations** | kWh, therms, m³, CCF | Aliases normalized; validator accepts water + m³/CCF |
| **Ambiguous usage** | `invoice_03`, `invoice_05` | Best-effort amount; null when unclear |
| **Empty PDF text** | `pdf-text-extractor.test.ts` | Readable error if extraction fails |
| **LLM variability** | `pipeline.test.ts` (mocked) | Deterministic tests without API cost |

---

## 3. Automated tests (implemented)

**45 tests** via Vitest (`npm test`). No API key required for the default suite.

| Suite | File | What it covers |
|-------|------|----------------|
| Schema | `tests/domain/invoice.schema.test.ts` | Valid/invalid rows, nullable `invoice_date` |
| Normalizer | `tests/domain/normalizer.test.ts` | Dates, units, multilingual utility synonyms |
| Validator | `tests/domain/invoice.validator.test.ts` | Warning codes, m³/CCF for water |
| PDF | `tests/services/pdf-text-extractor.test.ts` | Non-empty text from real PDF |
| Language | `tests/services/language-detector.test.ts` | franc on full invoice PDFs |
| Extractor shape | `tests/services/invoice-extractor.test.ts` | LLM output schema + confidence |
| Pipeline | `tests/services/pipeline.test.ts` | End-to-end with **mocked** LLM + port injection |
| Live (optional) | `tests/services/pipeline.live.test.ts` | One real Gemini call if `GOOGLE_API_KEY` is set |

```bash
npm test              # mocked suite (CI-friendly)
npm run test:live     # optional real API smoke test
```

---

## 4. How we would improve testing with more time

- **Golden-file regression**: commit expected CSV per fixture; fail CI on drift.
- **Labeled ground truth**: spreadsheet of correct field values per PDF for precision/recall metrics.
- **Field-level eval**: score each column separately (date parsing, usage amount, etc.).
- **Calibrated confidence**: correlate LLM `extraction_confidence` with human labels.
- **Retry policy**: re-prompt when confidence &lt; threshold or validation fails.
- **Fuzz / property tests**: random date strings through normalizer.
- **CI with live API**: gated job with secret, rate limits, and cost caps.
