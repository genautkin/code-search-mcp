# 🏗 Architecture & Technical Design

`code-search-mcp` is designed to be a lightweight, zero-daemon, embedded semantic search engine built for AI coding assistants.

```
┌─────────────────────────────────────────────────────────────┐
│                       AI Client                             │
│       (Claude Code / Gemini CLI / Antigravity / Cursor)     │
└──────────────────────────────┬──────────────────────────────┘
                               │ MCP Protocol (JSON-RPC over stdio)
┌──────────────────────────────▼──────────────────────────────┐
│                      code-search-mcp                        │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────┐  │
│  │   Scanner &      │  │  EmbeddingEngine │  │  Watcher  │  │
│  │ Layered Ignores  │  │  (all-MiniLM-L6) │  │(chokidar) │  │
│  └────────┬─────────┘  └────────┬─────────┘  └─────┬─────┘  │
│           │                     │                  │        │
│           └───────────┬─────────┴──────────────────┘        │
│                       ▼                                     │
│              VectorStore (LanceDB)                          │
│          Stored in node_modules/.cache/code-search/          │
│          lancedb/ (fallback: .code-search/)                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔑 Core Technical Decisions

### 1. In-Process Storage: LanceDB
- Replaces external vector databases (like ChromaDB, Qdrant, Milvus) that require running a separate background daemon and binding to TCP ports (e.g. port 8000).
- Uses Apache Arrow disk format for columnar queries and lightning-fast vector similarity searches.
- No network overhead, zero port conflicts, and 100% clean shutdown when the AI session exits.

### 2. In-Process Embeddings: `@huggingface/transformers` (ONNX)
- Uses the `Xenova/all-MiniLM-L6-v2` model running directly via local ONNX runtime in Node.js.
- Generates 384-dimensional dense vectors locally with zero token costs and zero API latency.
- Completely private — no code chunks are ever sent outside your local machine.

### 3. Local Index Storage

- The LanceDB index is stored at `node_modules/.cache/code-search/lancedb/` by default.
- If the project does not have `node_modules`, storage falls back cleanly to `.code-search/`.
- Both locations are local and intended to remain outside version control.

### 4. Non-Blocking Indexing with Real-Time Feedback
- Responds to MCP initialization handshakes in milliseconds (<15ms).
- If an agent performs a search while initial indexing is running, results from currently indexed chunks are returned immediately alongside a progress banner:
  ```text
  ⚠️ [Index status: INDEXING (45% complete - 2,250/5,000 files indexed)]
  Results from currently indexed files:
  ...
  ```

### 5. Live In-Process Watcher
- Watches project directories using `chokidar`.
- When a file is created, modified, or deleted, only that single file is re-chunked and re-embedded incrementally (~200ms).
- Eliminates the need for Git hooks (`pre-commit` / `post-checkout`) to keep vectors synchronized.

---

## 🛡 Layered Ignore Engine
Files are filtered before indexing using a 5-tier precedence model:
1. **Built-in System Excludes**: Binary files, videos, audio, images, archives, native builds (`ios/`, `android/`), and package manager locks.
2. **Project `.gitignore`**: Standard git ignore patterns.
3. **`.ignore`**: Ripgrep/FD style ignore patterns.
4. **`.codesearchignore`**: Specific overrides for semantic indexing.
5. **`.codesearchrc.json`**: Granular configuration (`batchSize`, `maxFileSizeKb`, `customExcludes`).
