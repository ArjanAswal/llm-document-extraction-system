# Testing approach

## How accuracy was validated

### Automated tests (41 tests)

| Area | Tests | Notes |
|------|-------|-------|
| Schema | `tests/domain/invoice.schema.test.ts` | Valid/invalid records, nullable fields |
| Normalizer | `tests/domain/normalizer.test.ts` | US/EU dates, unit aliases, synonyms |
| Validator | `tests/domain/invoice.validator.test.ts` | Each warning code |
| PDF extract | `tests/services/pdf-text-extractor.test.ts` | Real fixture PDF |
| Language | `tests/services/language-detector.test.ts` | franc on full PDF text |
| Pipeline | `tests/services/pipeline.test.ts` | Mocked LLM, port injection |
| Live (optional) | `tests/services/pipeline.live.test.ts` | Skipped without `GOOGLE_API_KEY` |

Run: `npm test` (mocked) · `npm run test:live` (real API)

### Manual spot-check matrix

| File | Expected utility | Language | Edge case | Observed |
|------|------------------|----------|-----------|----------|
| `invoice_01_electricity_us_clean.pdf` | electricity | en | complete | All fields populated, high confidence |
| `invoice_02_gas_uk_missing_fields.pdf` | gas | en | missing end date | `billing_period_end` empty |
| `invoice_03_agua_espanol_ambiguous.pdf` | water | es | ambiguous unit | `unit_type_mismatch` (m³ vs water heuristic) |
| `invoice_04_electricite_francais_missing.pdf` | electricity | fr | French date format | `normalization_lenient`, invoice_date needed LLM fix |
| `invoice_05_water_us_ambiguous.pdf` | water | en | ambiguous period | `billing_period_start` empty, `unit_type_mismatch` (CCF) |

Regenerate CSV: `npm run extract`

## Edge cases considered

- **Missing fields** — nullable columns, `missing_required_field` warning
- **Ambiguous usage** — null `usage_amount`, lower field confidence
- **Multilingual** — ES/FR detection on full PDF text (not short snippets)
- **Unit variants** — kWh, therms, gallons, m³; CCF triggers mismatch warning
- **Date formats** — US MM/DD, EU DD/MM, ISO; French prose dates may need lenient fallback

## Bonus validation expectations

| Fixture | Expected warnings | Confidence notes |
|---------|-------------------|------------------|
| invoice_01 | none/minimal | extraction_confidence ? 1.0 |
| invoice_02 | possibly missing field | high overall, low billing_period_end field score |
| invoice_03 | unit_type_mismatch | high extraction despite ambiguous unit |
| invoice_04 | normalization_lenient | invoice_date field_confidence = 0 |
| invoice_05 | unit_type_mismatch, missing period | usage_amount extracted but CCF not in canonical set |

## With more time

- Golden-file CSV regression tests per fixture
- Calibrated confidence (human labels + score correlation)
- Retry/fallback when extraction_confidence &lt; threshold
- Batch API for cost reduction at scale
- Expand unit map (CCF ? gallons conversion)
- Field-level eval harness with labeled ground truth
