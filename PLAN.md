# code-search-mcp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-daemon, cross-platform Node.js MCP server package (`code-search-mcp`) that automatically indexes code repositories using local embeddings, provides real-time progress feedback on queries mid-indexing, and auto-updates incrementally via file watching.

**Architecture:** Node.js + TypeScript stdio MCP server using `@lancedb/lancedb` for local vector storage, `@xenova/transformers` (running quantized `all-MiniLM-L6-v2`) for in-process ONNX embeddings, a non-blocking background indexing worker with progress tracking, a layered ignore matcher (`ignore` package), and `chokidar` for live file updates.

**Tech Stack:** 
- Runtime: Node.js 18+ (macOS, Windows, Linux)
- Language: TypeScript (ESM)
- MCP SDK: `@modelcontextprotocol/sdk`
- Vector DB: `@lancedb/lancedb` (embedded Apache Arrow vector engine)
- Embeddings: `@xenova/transformers` (local ONNX runtime)
- Ignore parser: `ignore`
- File Watcher: `chokidar`
- Testing: `vitest`

---

## File Structure

```
/Users/gennadiy.utkin/Documents/code/code-search-mcp/
├── bin/
│   └── cli.ts                     # Executable CLI entry point for npx
├── src/
│   ├── config/
│   │   ├── defaults.ts            # Default ignore lists, batch sizes, models
│   │   └── loader.ts              # Config reader (.codesearchrc.json, .gitignore)
│   ├── embeddings/
│   │   └── engine.ts              # Local ONNX embedding generator
│   ├── store/
│   │   └── lancedb.ts             # LanceDB schema, table management, vector search
│   ├── indexer/
│   │   ├── chunker.ts             # AST / line-aware code chunker with overlap
│   │   ├── scanner.ts             # File discovery and hash/mtime cache
│   │   ├── worker.ts              # Background batch worker with atomic progress
│   │   └── watcher.ts             # Incremental file watcher (chokidar)
│   ├── server/
│   │   └── mcp.ts                 # MCP Server (query, get_status, reindex tools)
│   ├── index.ts                   # Main export
│   └── types.ts                   # TypeScript interfaces and types
├── tests/
│   ├── config.test.ts             # Ignore rules and config loading tests
│   ├── chunker.test.ts            # Code chunking & boundary tests
│   ├── scanner.test.ts            # File discovery & hashing tests
│   ├── embeddings.test.ts         # In-process embeddings test
│   ├── store.test.ts              # LanceDB insert and similarity search test
│   └── worker.test.ts             # Indexing progress and query mid-index test
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

### Task 1: Project Scaffolding & Configuration

**Files:**
- Create: `/Users/gennadiy.utkin/Documents/code/code-search-mcp/package.json`
- Create: `/Users/gennadiy.utkin/Documents/code/code-search-mcp/tsconfig.json`
- Create: `/Users/gennadiy.utkin/Documents/code/code-search-mcp/vitest.config.ts`
- Create: `/Users/gennadiy.utkin/Documents/code/code-search-mcp/src/types.ts`

- [ ] **Step 1: Initialize package.json with dependencies and bin configuration**
- [ ] **Step 2: Configure tsconfig.json and vitest.config.ts for ESM & Node 18+**
- [ ] **Step 3: Define core TypeScript interfaces in `src/types.ts`**
- [ ] **Step 4: Run `npm install` and verify base setup**

---

### Task 2: Config Loader & Ignore Engine

**Files:**
- Create: `src/config/defaults.ts`
- Create: `src/config/loader.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Write failing unit test for layered ignore system (.gitignore + defaults + .codesearchignore)**
- [ ] **Step 2: Implement default ignore patterns (node_modules, dist, lock files, binary extensions, etc.)**
- [ ] **Step 3: Implement `loadConfig(projectRoot)` resolving `.gitignore`, `.ignore`, and `.codesearchrc.json`**
- [ ] **Step 4: Run test to verify ignore resolution passes**

---

### Task 3: AST & Smart Code Chunker

**Files:**
- Create: `src/indexer/chunker.ts`
- Test: `tests/chunker.test.ts`

- [ ] **Step 1: Write unit tests verifying chunk size, overlap, line numbers, and comment preservation**
- [ ] **Step 2: Implement language-aware chunking with line start/end tracking and content hashing**
- [ ] **Step 3: Run unit tests to verify chunking accuracy**

---

### Task 4: In-Process Embeddings Engine

**Files:**
- Create: `src/embeddings/engine.ts`
- Test: `tests/embeddings.test.ts`

- [ ] **Step 1: Write unit test for generating vector embeddings locally via `@xenova/transformers`**
- [ ] **Step 2: Implement singleton `EmbeddingEngine` with lazy model initialization (default: `Xenova/all-MiniLM-L6-v2`)**
- [ ] **Step 3: Add batch embedding generation helper with concurrency controls**
- [ ] **Step 4: Verify embeddings test generates 384-dim normalized vectors**

---

### Task 5: Embedded LanceDB Storage Engine

**Files:**
- Create: `src/store/lancedb.ts`
- Test: `tests/store.test.ts`

- [ ] **Step 1: Write unit test for table creation, chunk insertion, upserting, and vector cosine search**
- [ ] **Step 2: Implement `VectorStore` class managing `<project-root>/.code-search/lancedb`**
- [ ] **Step 3: Implement atomic delete-by-file-path and batch insert methods**
- [ ] **Step 4: Run tests to verify LanceDB persistence and search ranking**

---

### Task 6: Background Scanner, Indexer Worker & Progress Tracking

**Files:**
- Create: `src/indexer/scanner.ts`
- Create: `src/indexer/worker.ts`
- Test: `tests/worker.test.ts`

- [ ] **Step 1: Write unit test for scanning files, computing mtime/MD5 diffs, and tracking indexing progress**
- [ ] **Step 2: Implement `FileScanner` that returns list of files needing indexing vs unchanged files**
- [ ] **Step 3: Implement `IndexerWorker` managing batch queue, state machine (`idle` | `indexing` | `ready`), and statistics**
- [ ] **Step 4: Verify search queries during `indexing` state return partial results plus progress metadata**

---

### Task 7: Incremental File Watcher

**Files:**
- Create: `src/indexer/watcher.ts`
- Test: `tests/watcher.test.ts`

- [ ] **Step 1: Write unit test for file change, addition, and deletion events updating the index**
- [ ] **Step 2: Implement `FileWatcher` with 500ms debounce using `chokidar`**
- [ ] **Step 3: Verify that modifying a file re-indexes only that single file without rebuilding the entire database**

---

### Task 8: MCP Server & Tool Handlers

**Files:**
- Create: `src/server/mcp.ts`
- Create: `src/index.ts`
- Create: `bin/cli.ts`

- [ ] **Step 1: Implement MCP server using `@modelcontextprotocol/sdk`**
- [ ] **Step 2: Expose `code_search` tool (handles query, returns progress banner if indexing is running)**
- [ ] **Step 3: Expose `code_search_status` tool (returns index stats, file count, and progress %)**
- [ ] **Step 4: Expose `code_search_reindex` tool (forces full or partial reindex)**
- [ ] **Step 5: Create `bin/cli.ts` supporting `npx code-search-mcp` stdio execution**

---

### Task 9: End-to-End Integration Verification & Documentation

**Files:**
- Create: `README.md`
- Create: `test-repo/` (fixture for end-to-end testing)

- [ ] **Step 1: Run end-to-end integration test against test repository**
- [ ] **Step 2: Verify Claude Code & Gemini CLI configuration syntax in README**
- [ ] **Step 3: Verify cross-platform path handling and packaging readiness**
