# Phase gates

Work stops at each gate for verification before continuing.

## Phase 0 � Meta layer

- [ ] `.cursor/rules/project.mdc` reflects plan-first + gate stops
- [ ] `docs/INVARIANTS.md` matches multilingual / no-translation decision
- [ ] `docs/COMMITS.md` co-author trailer present
- [ ] `git log -1` shows expected message

## Phase 1 � Bootstrap

- [ ] `npm install` succeeds
- [ ] `npm test` passes (smoke)
- [ ] `npm run build` emits `dist/`
- [ ] `.env.example` documents vars

## Phase 2 � Domain

- [ ] Schema matches brief + bonus columns in `CSV_COLUMNS`
- [ ] Normalizer + validator tests green
- [ ] Domain has zero LangChain imports

## Phase 3 � Services + CLI

- [ ] `npm run extract` processes all 5 PDFs
- [ ] CSV has 5 rows + bonus columns
- [ ] `npm test` passes (mocked suite)

---

## Gate report template

```markdown
## Phase N Report

### Done
- [bullets]

### Verification
- Command outputs (test/build/extract)

### git log
(paste `git log --oneline -n 10`)

### Decisions / feedback needed
- [your notes]

### Ready for Phase N+1?
- [ ] Yes / [ ] Changes requested
```
