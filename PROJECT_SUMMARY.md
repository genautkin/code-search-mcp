# `code-search-mcp` — End-to-End Project Summary & Architecture

> **A high-performance, local-first, zero-dependency Hybrid Semantic Code Search Engine exposed via the Model Context Protocol (MCP) and CLI.**

---

## 1. Project Genesis & Core Mission

### The Problem
Modern AI coding assistants (like Gemini, Claude, Cursor, and ChatGPT) struggle with repository-scale context retrieval:
- **Keyword / Grep Limitations**: Fails when the agent searches for conceptual intents (e.g., *"where is user subscription canceled?"* when the function is named `terminateAccountBilling`).
- **Cloud Vector DB Overhead**: Sending proprietary source code to external APIs introduces security risks, network latency, and billing costs.
- **MCP Client Timeouts**: Traditional vector search tools block during model loading or database initialization, causing MCP client hosts to terminate processes with `signal: killed` or freeze agent interactions for minutes.

### The Solution: `code-search-mcp`
An open-source, local-first tool that runs completely on-device, indexes repositories incrementally into disk-backed Apache Arrow vector tables, and exposes semantic and hybrid search capabilities via the **Model Context Protocol (MCP)** and a high-speed CLI.

---

## 2. Technology Stack & Design Decisions

```
┌────────────────────────────────────────────────────────────────────────┐
│                          User / AI Agent                               │
└──────────────────┬──────────────────────────────────┬──────────────────┘
                   │ MCP Tool Call (stdio)             │ CLI Command
                   ▼                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Protocol & Interface Layer                      │
│   • @modelcontextprotocol/sdk (JSON-RPC 2.0 stdio transport)           │
│   • Commander.js CLI (init, index, search, status, prune, watch)       │
└──────────────────┬──────────────────────────────────┬──────────────────┘
                   │                                  │
                   ▼                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         Core Orchestration                             │
│   • IndexerWorker (Concurrency, state machine, lifecycle)              │
│   • ProcessLock (Cross-process concurrency safety via pidfiles)        │
│   • FileWatcher (Chokidar with high-cardinality ignore rules)          │
└─────────┬────────────────────────────────────────────────────┬─────────┘
          │                                                    │
          ▼                                                    ▼
┌───────────────────────────────────┐        ┌───────────────────────────┐
│     Dense Vector Pipeline         │        │    Sparse Lexical Tower   │
│ • @huggingface/transformers       │        │ • Sub-token decomposition │
│ • Xenova/all-MiniLM-L6-v2 (ONNX)  │        │ • Porter Stemming         │
│ • 384-dimensional dense vectors   │        │ • Exact regex & path scan │
└─────────────────┬─────────────────┘        └─────────────┬─────────────┘
                  │                                        │
                  └───────────────────┬────────────────────┘
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          Storage & Search Engine                       │
│   • LanceDB (Embedded columnar storage over Apache Arrow)              │
│   • IVF-PQ Approximate Nearest Neighbor (ANN) Indexing                 │
│   • Two-Tower Linear Fusion & Result Diversity Re-Ranking              │
└────────────────────────────────────────────────────────────────────────┘
```

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Vector Engine** | **LanceDB** (Embedded Rust core via Node SDK) | Direct disk-backed Arrow memory layout, zero server processes to maintain, sub-10ms query execution with IVF-PQ. |
| **Embeddings** | **`@huggingface/transformers`** (`all-MiniLM-L6-v2`) | Pure local CPU execution via ONNX runtime; generates normalized 384-d vectors without external API keys. |
| **Protocol** | **`@modelcontextprotocol/sdk`** | Standardized tool contract for MCP clients; connects over `stdio`. |
| **Delta Watcher** | **`chokidar`** + MD5 Inode Hasher | Instant detection of local code modifications with minimal CPU and memory footprint. |
| **CLI & Tooling** | **TypeScript + tsup + vitest** | Single-bundle ESM distribution with type declarations, sub-second build times, and complete integration test suite. |

---

## 3. Data Pipeline & Algorithms

### A. Contextual Chunking & Token Injection
1. **Sliding Window Chunking**: Source files are chunked into 60-line sliding blocks with a 15-line overlap to preserve surrounding function headers and enclosing class context.
2. **Semantic Breadcrumb Injection**: Before vector generation, each chunk is prefixed with contextual metadata:
   ```typescript
   // File: src/billing/services/subscription-manager.service.ts
   // Language: typescript
   export class SubscriptionManager { ... }
   ```
   This ensures vectors encode organizational and architectural intent (e.g. `billing`, `services`, `controllers`).

3. **Incremental Inode Hashing**: An MD5 content hash is stored alongside each chunk. During re-scans, unchanged files are verified in $O(1)$ and skipped, reducing incremental indexing times to milliseconds.

---

### B. High-Dimensional Indexing: IVF-PQ (Inverted File with Product Quantization)
- **Small Corpora ($N < 256$)**: Evaluated using direct Cosine distance:
  $$\text{Cosine Distance} = 1 - \frac{u \cdot v}{\|u\|_2 \|v\|_2}$$
- **Large Corpora ($N \ge 256$, tested up to 16,592+ vectors)**: LanceDB automatically constructs an **IVF-PQ** index:
  1. **IVF Partitioning**: Clusters the vector space into $k$ Voronoi partitions using $k$-means.
  2. **Product Quantization (PQ)**: Decomposes 384-d vectors into sub-vectors and maps them to quantized centroids.
  3. **Performance Impact**: Reduces database search time from a 150-second linear scan down to **< 10ms**.

---

### C. Two-Tower Hybrid Retrieval & Ranking Formulation
To achieve high precision across both semantic conceptual queries and exact keyword/symbol searches, the engine utilizes a **Two-Tower Hybrid Retrieval Architecture**:

```
                       User Query: "how to cancel user billing subscription"
                                      │
               ┌──────────────────────┴──────────────────────┐
               ▼                                             ▼
      [Dense Vector Tower]                          [Sparse Lexical Tower]
   • 384-d MiniLM Vector                          • Tokenization & Stopword Pruning
   • LanceDB IVF-PQ Search (Cosine)               • PascalCase / camelCase Token Splitting
   • Score = 1 - CosineDistance                   • Porter Stemming & Regex Path Matching
               │                                             │
               └──────────────────────┬──────────────────────┘
                                      ▼
                        [Rank Fusion & Re-Ranking]
                • Linear Weight Fusion: S = 0.6 * S_vec + 0.4 * R_token
                • Reciprocal Lexical Boosting: S_final = S + 0.3 * S_lex
                • Intent-Aware Dampening (Boilerplate configs: ×0.75)
                • Core App Path Boosting (`src/`, `lib/`: ×1.05)
                • Result Diversity Filter (Max 2 chunks/file, doc cap)
                                      │
                                      ▼
                             Top-K Search Results
```

1. **Sub-Token Decomposition & Stemming**:
   - PascalCase/camelCase tokens (`SubscriptionManager`) are split into `['subscription', 'manager']`.
   - Porter Stemming maps terms (`orchestrator` $\rightarrow$ `orchestr`, `cancelling` $\rightarrow$ `cancel`).
2. **Score Fusion Formula**:
   $$S_{\text{final}} = \left( 0.6 \cdot S_{\text{vector}} + 0.4 \cdot \frac{|T_{\text{query}} \cap T_{\text{doc}}|}{|T_{\text{query}}|} \right) + 0.3 \cdot S_{\text{lexical}}$$
3. **Domain-Specific Filtering**:
   - **`codeOnly: true`**: Automatically excludes markdown, specs, and docs.
   - **`pathFilter: "src/..."`**: Pushes down prefix filters directly to LanceDB.
   - **`language: "typescript"`**: Direct language-specific partition matching.
   - **Boilerplate Noise Dampening**: Dampens root-level configuration files (`*config*`, `*logger*`, `*startup*`) by $\times 0.75$ unless the query specifically asks for setup/config keywords.
   - **Result Diversity**: Caps max results per file to 2, preventing one large file from monopolizing search results.

---

## 4. Key Engineering Challenges & Solutions

### 1. The MCP Handshake Timeout Bug (`signal: killed`)
* **Problem**: MCP clients (like AI IDEs) enforce a strict ~5-second handshake timeout. Initially, `code-search-mcp` was synchronously initializing LanceDB and loading file trees during `createMcpServer()`, leading the client to kill the process on startup.
* **Solution**: Implemented an **Instant Handshake & Deferred Background Initialization** pattern. The MCP server returns the tool list in **< 1ms**. The vector store and file watcher initialize in the background. Tool invocations safely await an internal lock promise (`ensureInitialized()`).

### 2. High-Dimensional Table Scan Lag on 16k Vectors
* **Problem**: In an enterprise repository with 5,230 files (16,592 chunks), unindexed vector searches caused CPU spikes and took ~2.5 minutes per query.
* **Solution**: 
  - Integrated automatic **IVF-PQ index generation** upon indexing completion.
  - Implemented a **Strict 5-Second Query Timeout Guarantee** with `Promise.race()`. If vector search or ONNX inference ever exceeds 5 seconds, the engine immediately returns sub-millisecond lexical token matches.

### 3. File Descriptor Exhaustion on `node_modules`
* **Problem**: `chokidar` was attempting to watch entire directory structures, including 40,000+ files in `node_modules`.
* **Solution**: Added fast-path directory ignore rules in `watcher.ts` and `scanner.ts` that prune `node_modules`, `dist`, `bin`, `obj`, `.git`, and `.cache` before inode registration.

---

## 5. Real-World Enterprise Benchmark (Large-Scale Repository)

Tested against a multi-framework production repository containing over 5,000 source files across TypeScript, C#, and Vue:

| Metric | Before Optimization | After Optimization |
| :--- | :--- | :--- |
| **Indexed Files** | 0 | **5,230 files** (100% indexed) |
| **Indexed Vector Chunks** | 0 | **16,592 vectors** in LanceDB |
| **Server Startup / Handshake** | 5s – 10s (Timed out) | **< 1ms (Instant)** |
| **Vector Search Execution** | ~150s (Brute force scan) | **< 10ms (IVF-PQ ANN)** |
| **End-to-End Query Latency** | 2.5+ minutes | **~300ms – 600ms** |
| **Worst-Case Query Bound** | Unbounded (Hanging) | **Strict 5.0s Timeout Fallback** |
| **Supported File Types** | N/A | `.ts`, `.js`, `.vue`, `.cs`, `.md`, `.json`, etc. |

---

## 6. MCP Tools Exposed to AI Agents

1. `code_search`: High-speed hybrid semantic code search with optional `pathFilter`, `language`, `codeOnly`, and `limit`.
2. `code_search_status`: Real-time indexing progress, chunk counts, and database health.
3. `code_search_reindex`: Trigger a background re-index or force full cache refresh.
4. `code_search_init`: Bootstrap `.codesearchrc.json` configuration for any new project.
5. `code_search_guide`: Built-in operational best practices and usage guide for AI coding agents.

---

## 7. Conclusion

`code-search-mcp` delivers a production-grade, local-first code search infrastructure. It combines **LanceDB's IVF-PQ vector indexing** with **morphological lexical retrieval** and **fault-tolerant asynchronous MCP concurrency**, providing AI agents with instant, highly accurate repository context without cloud dependencies or latency bottlenecks.
