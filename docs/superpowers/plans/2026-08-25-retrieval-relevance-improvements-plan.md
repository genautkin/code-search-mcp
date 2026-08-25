# Retrieval Relevance Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Establish a reproducible retrieval baseline, then improve relevance conservatively through measured symbol-aware chunking and only justified lexical/fusion changes.

**Architecture:** Keep `IndexerWorker`, `VectorStore`, LanceDB, MiniLM, public MCP tools, and the existing line-chunking fallback. Add benchmark/scoring utilities first; then add optional TypeScript/JavaScript structural metadata and chunking; finally evaluate lexical candidate generation and rank fusion behind small, testable internal functions.

**Tech Stack:** TypeScript, Node.js, Vitest, LanceDB, `@huggingface/transformers`, existing repository APIs.

---

## Checkpoint 0: repository audit

### Task 0.1: Record current implementation behavior

**Files:**
- Create: `docs/retrieval-baseline-audit.md`
- Read: `src/indexer/chunker.ts`, `src/embeddings/engine.ts`, `src/store/lancedb.ts`, `src/indexer/worker.ts`, `src/types.ts`, relevant tests.

- [ ] Document the current 45-line/10-line-overlap defaults, metadata, embedding breadcrumb format, 2,048-character embedding truncation, lexical path-first candidate generation, hybrid score formula, filters, diversity rules, and incremental update flow.
- [ ] Run `npm test -- --runInBand` or the repository-supported equivalent and record the result without modifying production code.
- [ ] Commit the audit as `docs: record retrieval baseline audit`.

Expected result: a factual inventory with no claimed relevance improvement and no production behavior changes.

## Checkpoint 1: relevance benchmark baseline

### Task 1.1: Define benchmark cases and metrics

**Files:**
- Create: `src/benchmark/relevance-types.ts`
- Create: `src/benchmark/relevance-cases.ts`
- Create: `src/benchmark/relevance-metrics.ts`
- Test: `tests/relevance-metrics.test.ts`

- [ ] Write failing tests for Hit@1, Hit@3, Hit@5, MRR, and Recall@10 using exact file, exact symbol, and optional line-range expectations.
- [ ] Define `SearchBenchmarkCase` with explicit relevance modes so an expected symbol must occur in the returned snippet, not just somewhere in the same file:

```ts
export interface SearchBenchmarkCase {
  query: string;
  expectedFiles?: string[];
  expectedSymbols?: string[];
  expectedLineRanges?: Array<{ filePath: string; startLine: number; endLine: number }>;
  relevanceMode: 'file' | 'symbol' | 'file-or-symbol';
  description?: string;
}
```

- [ ] Add at least 30 repository-grounded cases covering exact symbols, partial symbols, conceptual queries, vocabulary mismatch, path/language concepts, configuration, constants/errors, and filters. Use symbols and paths that actually exist in the repository.
- [ ] Run `npx vitest run tests/relevance-metrics.test.ts`; verify the new tests fail before implementing the metric functions.
- [ ] Implement pure metric functions with deterministic tie handling and zero-result behavior.
- [ ] Rerun the focused test and then `npm test`; expected result is all passing.

### Task 1.2: Build a deterministic benchmark runner

**Files:**
- Create: `src/benchmark/relevance-runner.ts`
- Create: `bin/relevance-benchmark.ts`
- Modify: `package.json`
- Test: `tests/relevance-runner.test.ts`

- [ ] Write failing tests that run the scorer against a fake search callback and assert JSON/Markdown report contents, repository revision, case count, and metric values.
- [ ] Implement a runner accepting `{ cases, search }`, returning per-case ranked results and aggregate metrics without importing CLI globals.
- [ ] Implement the CLI command `npm run benchmark:relevance` using `tsx`-free Node-compatible TypeScript build conventions already used by `tsup`; add the script entry to call the built benchmark binary.
- [ ] Use an explicitly named temporary LanceDB directory under the OS temp directory for each run; never silently use `.code-search` or `node_modules/.cache`.
- [ ] Build the benchmark index through existing scanner/chunker/embedding/store APIs, and write `reports/relevance/baseline.json` plus `reports/relevance/baseline.md` only when the command is run.
- [ ] Record the current git revision, model name, case count, index path, and timings. Do not commit generated reports unless the user requests them.
- [ ] Run the focused tests, then `npm run build`, then `npm test`.

### Task 1.3: Capture and review the baseline

**Files:**
- Create: `docs/relevance-baseline.md`
- Generated locally: `reports/relevance/baseline.json`, `reports/relevance/baseline.md`

- [ ] Run `npm run benchmark:relevance` against the repository.
- [ ] Copy only the measured aggregate Hit@1, Hit@3, Hit@5, MRR, Recall@10, and timing values into `docs/relevance-baseline.md`.
- [ ] List concrete failure examples by query and returned result; do not infer causes until verified in source.
- [ ] Review the baseline checkpoint before changing chunking or ranking.

## Checkpoint 2: embedding-length instrumentation

### Task 2.1: Measure embedding representations without changing model behavior

**Files:**
- Create: `src/embeddings/input-length.ts`
- Modify: `src/embeddings/engine.ts`
- Test: `tests/embedding-input-length.test.ts`

- [ ] Write failing tests for normalized character length, tokenizer-estimated length when available, truncation-risk classification at 2,048 characters, and batch consistency.
- [ ] Implement a pure `inspectEmbeddingInput` helper and expose instrumentation through an additive method or diagnostic callback; keep `embedText` and `embedBatch` output unchanged.
- [ ] Run focused tests to confirm red, implement minimal behavior, then rerun until green.
- [ ] Add benchmark diagnostics reporting the number and percentage of inputs at truncation risk.
- [ ] Run `npm test` and `npm run build`.

## Checkpoint 3: symbol-aware TypeScript/JavaScript chunking

### Task 3.1: Add structural metadata types and fallback contract

**Files:**
- Modify: `src/types.ts`
- Modify: `src/indexer/chunker.ts`
- Test: `tests/chunker.test.ts`

- [ ] Write failing tests for optional `symbolName`, `parentSymbol`, and `symbolKind`; assert old callers can still construct chunks without those fields.
- [ ] Add optional metadata fields and a structural chunker interface that returns either symbol chunks or `null`/an explicit unsupported result.
- [ ] Keep IDs stable and unique using normalized path and line range; preserve original source content.
- [ ] Run the focused tests before and after implementation.

### Task 3.2: Implement a conservative TypeScript/JavaScript structure detector

**Files:**
- Create: `src/indexer/structure.ts`
- Modify: `src/indexer/chunker.ts`
- Test: `tests/structure.test.ts`

- [ ] Write failing tests for exported classes, methods, functions, constructors, nested methods, comments/strings containing brace-like text, unsupported languages, and malformed TypeScript/JavaScript.
- [ ] Implement the smallest dependency-free detector that tracks braces while ignoring strings/comments and recognizes TypeScript/JavaScript declarations. If reliable detection cannot be achieved without a parser, stop and document that outcome rather than adding a large dependency.
- [ ] Return line-bounded symbols only when boundaries are reliable; return the existing line chunker for unsupported or malformed input.
- [ ] For symbols longer than the embedding input budget, split at safe line boundaries and retain the same symbol metadata on each subchunk.
- [ ] Run `npx vitest run tests/structure.test.ts tests/chunker.test.ts`, then `npm test`.

### Task 3.3: Integrate structural chunks into full and incremental indexing

**Files:**
- Modify: `src/indexer/worker.ts`
- Modify: `src/store/lancedb.ts`
- Modify: `src/indexer/chunker.ts`
- Test: `tests/worker.test.ts`
- Test: `tests/store.test.ts`

- [ ] Write failing tests proving both `startIndexing` and `indexSingleFile` use symbol chunks when detection succeeds and line chunks when it fails.
- [ ] Add LanceDB-compatible optional metadata columns without breaking reads of old tables. If LanceDB cannot evolve the schema safely, use a versioned rebuild path that requires an explicit full reindex and test that no index is silently deleted.
- [ ] Include structural breadcrumbs only in `formatChunkForEmbedding`; leave returned source content unchanged.
- [ ] Preserve delete-before-insert behavior for incremental updates and existing vector-index creation.
- [ ] Run focused worker/store tests, then the full suite and build.

## Checkpoint 4: lexical retrieval and fusion experiments

### Task 4.1: Fix lexical candidate generation before changing scoring

**Files:**
- Modify: `src/store/lancedb.ts`
- Test: `tests/store.test.ts`

- [ ] Write failing tests for a content-only exact identifier that is absent from the path, a camelCase identifier, and a conceptual token match.
- [ ] Replace path-only candidate gating with a bounded candidate strategy that can inspect content through existing LanceDB capabilities without removing path filtering, timeout fallback, or JSON/config heuristics.
- [ ] Preserve exact identifier matches and avoid destructive stemming of code identifiers.
- [ ] Run focused store tests, then `npm test`.

### Task 4.2: Evaluate BM25/native FTS and RRF

**Files:**
- Create: `src/store/ranking.ts`
- Modify: `src/store/lancedb.ts`
- Test: `tests/ranking.test.ts`
- Modify: `src/benchmark/relevance-runner.ts`

- [ ] Write failing tests for deterministic weighted Reciprocal Rank Fusion across dense, lexical, and exact-symbol lists, including duplicate result merging and missing-list behavior.
- [ ] Inspect the installed LanceDB API before adding dependencies. Implement native FTS/BM25 only if it is supported cleanly by the installed version and preserves incremental indexing; otherwise retain the improved lexical scorer and document why.
- [ ] Add benchmark modes for current hybrid, symbol-only, lexical-only, and RRF candidates.
- [ ] Run the benchmark for each candidate and keep changes only when Hit@1/Hit@3/MRR improve without violating exact-symbol regression tests or timeout behavior.
- [ ] Run the full suite and build.

## Checkpoint 5: final ablation, performance, and handoff

### Task 5.1: Run final comparisons and regression verification

**Files:**
- Create: `docs/retrieval-improvements-report.md`
- Generated locally: `reports/relevance/*.json`, `reports/relevance/*.md`

- [ ] Run the required ablations: current system, symbol chunking, stronger lexical retrieval, symbol plus lexical retrieval, and RRF if implemented.
- [ ] Measure full indexing time, incremental indexing time, database size, query p50/p95, and memory observations using reproducible commands and the same repository revision.
- [ ] Run `npm test`, `npm run build`, and `git diff --check`.
- [ ] Report only measured numbers, concrete problems, implemented changes, rejected experiments, and remaining limitations.
- [ ] Review the final diff for public API compatibility and generated-file noise.
- [ ] Commit the implementation in small feature commits or a clearly grouped final commit after verification.

