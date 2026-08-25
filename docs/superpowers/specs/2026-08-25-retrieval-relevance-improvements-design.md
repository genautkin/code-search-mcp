# Retrieval Relevance Improvements Design

## Goal

Improve retrieval relevance in the existing `code-search-mcp` implementation through measured, incremental changes while preserving its public APIs and operational safeguards.

## Scope and checkpoints

Work proceeds in checkpoints so each stage can be reviewed before the next behavior change:

1. Document the current indexing and retrieval behavior.
2. Add a repeatable relevance benchmark and record the current baseline.
3. Review the baseline and identify the highest-value next change.
4. Add symbol-aware chunking with a safe fallback to the existing line chunker.
5. Measure chunk/embedding input lengths and rerun tests and relevance benchmarks.
6. Investigate and implement stronger lexical retrieval or rank fusion only if the benchmark shows a justified opportunity.
7. Run ablations and performance checks, then document the final results.

The first implementation checkpoint is limited to the benchmark and baseline. No ranking, chunking, embedding-model, storage, or public API behavior changes occur before the baseline is recorded.

## Existing behavior to preserve

- The MCP server, CLI, configuration format, and public tool names remain compatible.
- LanceDB remains the storage and vector-search backend.
- The local MiniLM embedding model remains unchanged.
- Incremental indexing, file watching, filters, lexical fallback, and the strict search timeout remain functional.
- AST or parser failures must never make a source file unsearchable.
- Returned source content remains the original source representation; any contextual text is used only for embedding or ranking.

## Current implementation findings

- `src/indexer/chunker.ts` uses line-based chunks with configurable maximum size and overlap, snapping some boundaries to natural-looking lines. It extracts identifiers for embedding context but does not create symbol-bounded chunks.
- `formatChunkForEmbedding` adds file path, line range, language, and extracted symbols to the embedding representation.
- `CodeChunk` stores file path, absolute path, line range, source content, content hash, language, timestamp, and optional vector. It does not yet store explicit symbol metadata.
- `VectorStore.searchLexical` uses LanceDB path predicates and custom token/content scoring with query enhancement, stemming, camelCase splitting, and path boosts. It is not native BM25.
- `VectorStore.searchHybrid` combines dense candidates with lexical candidates using raw score weighting, token overlap, JSON/config heuristics, and source-folder boosts.
- `IndexerWorker` creates chunks, embeds contextual representations, writes them to LanceDB, and uses the same flow for full and single-file indexing.
- Existing tests cover chunking, embeddings, storage, worker behavior, and integration flows, but there is no retrieval relevance benchmark with labeled expected files or symbols.

## Benchmark design

Add a small, deterministic benchmark module and repository-local case data. Each case will contain:

```ts
interface SearchBenchmarkCase {
  query: string;
  expectedFiles?: string[];
  expectedSymbols?: string[];
  description?: string;
}
```

The initial suite will contain at least 30 realistic queries drawn from this repository, covering exact and partial symbols, conceptual questions, vocabulary mismatch, path/language concepts, configuration, and errors/constants. Cases will use stable repository symbols and paths rather than invented examples.

The benchmark will calculate Hit@1, Hit@3, Hit@5, MRR, and Recall@10 when the case has suitable expected files. A result is relevant when its file matches an expected file, or when its content/metadata contains an expected symbol according to the case definition. The benchmark will emit machine-readable and human-readable output so later ablations can be compared without inventing values.

The baseline will exercise the existing indexed repository and current search path. If a fully initialized repository index is not safely reusable in tests, the benchmark will use a temporary LanceDB index built from the repository fixtures and the existing indexing/search APIs.

## Symbol-aware chunking design

After the baseline checkpoint, introduce a focused symbol-boundary layer above the current chunker:

```text
source file
  -> supported parser/structure detector
  -> coherent symbol chunks where possible
  -> existing line chunker fallback on unsupported or failed parsing
```

The implementation will first reuse dependencies already present. A large parser dependency will not be added without checking language coverage, package impact, and measurable benefit. The fallback remains the existing line chunker, ensuring every previously searchable file remains searchable.

Where structure is available, chunks may carry `symbolName`, `parentSymbol`, and `symbolKind` metadata alongside existing line/path/language fields. Embedding text will include these breadcrumbs, while returned `content` remains unchanged. Exact identifier matching will remain a strong ranking signal and will not be replaced by stemming or semantic similarity.

## Embedding-length instrumentation

Measure the actual embedding input representation before changing chunk sizes or models. Record chunk character length and an estimated/tokenized length using the existing embedding tokenizer when available. Tests and benchmark output will identify the count and percentage of chunks that may exceed MiniLM's effective input length. Oversized chunks will be split before embedding rather than silently truncated.

## Lexical and fusion design

Only after benchmark evidence will lexical or fusion behavior change. The existing LanceDB version and capabilities will be inspected first. If native FTS/BM25 integrates cleanly, it will be evaluated against the current lexical scorer; otherwise, the current scorer will be improved conservatively.

Fusion candidates will be compared experimentally:

- current hybrid score
- symbol-aware chunking without lexical changes
- stronger lexical retrieval without chunking changes
- reciprocal rank fusion over dense, lexical, and exact-symbol candidates
- combined changes only when the ablation supports them

The selected approach must preserve exact symbol definitions near the top for queries such as `TradeFromChartBridge` and `openSidebar`, while also improving conceptual queries. No change will be accepted based only on theoretical score comparability; benchmark metrics and regression tests must support it.

## Verification and deliverables

Each checkpoint will run the focused tests first, then the full test suite. Final reporting will include:

- existing behavior and concrete problems found;
- files and algorithms changed;
- baseline and post-change Hit@1, Hit@3, Hit@5, MRR, and Recall@10 where applicable;
- ablation comparisons;
- indexing time, incremental indexing time, database size, query p50/p95, and memory observations when measurable;
- explicit notes where a proposed improvement was not implemented because the benchmark did not justify it.

No benchmark result will be fabricated or reported without a reproducible command and captured output.
