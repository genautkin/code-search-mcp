# How We Built a Zero-Daemon Semantic Code Search for AI Coding Agents

*Stop grepping for exact words. Give your AI coding assistant the power to search your codebase by meaning.*

---

## ☕️ Imagine a Coffee Shop App

Imagine you are building software for a busy local coffee shop.

In your codebase, you have a file that handles what happens when a customer orders an extra oat milk latte and gets a morning discount:

```typescript
// Apply a 15% promotional deduction if the customer visits before 9 AM
export function calculateEarlyBirdReward(bill: OrderSummary): number {
  if (bill.orderHour < 9) {
    return bill.subtotal * 0.85;
  }
  return bill.subtotal;
}
```

Now imagine you open your AI coding assistant (like Claude Code, Cursor, or Gemini CLI) and ask:

> *"Where is the morning drink discount calculated?"*

If your tool relies only on **traditional text search (like `grep`)**, it searches for the exact word `"discount"`. 
- Did it find `calculateEarlyBirdReward`? **No.**
- Why? Because the code used the words `promotional deduction` and `EarlyBirdReward`, but never the exact word `"discount"`.

This is where **Semantic Search** changes everything.

---

## 🧠 What is Semantic Search (In Plain English)?

Traditional search looks for **exact letters and words**. 

**Semantic search looks for the *meaning* behind your words.**

### How It Works: The Map of Meaning
1. **Numbers instead of letters**: An AI model takes a piece of text (or code) and translates it into a list of numbers called an **embedding** (or vector).
2. **Coordinates on a map**: Think of these numbers like GPS coordinates on a giant map of human concepts.
   - `"discount"` and `"promotional deduction"` end up sitting right next to each other on the map.
   - `"espresso shot"` and `"latte"` sit together.
   - `"database migration"` sits far away on the other side of the map.
3. **Finding nearest neighbors**: When you ask a question in plain English, the search engine turns your question into coordinates and simply finds the pieces of code sitting closest to it on the map.

```
                  [ Map of Meaning ]

   ☕️ "morning drink discount"   📍 (Your Question)
              │ (Close!)
              ▼
   🏷 "calculateEarlyBirdReward" 📍 (Your Code)
   
   ─────────────────────────────────────────────
   
   🗄 "sql database migration"   📍 (Far Away - Ignored)
```

---

## 🚀 Why Semantic Search is a Game-Changer for AI Coding

When AI coding assistants work on large repositories with thousands of files, they cannot read every single file on every prompt — it is too slow and costs too many tokens.

Instead, the AI needs to **find the exact 2 or 3 relevant files instantly**.

In real-world projects, our codebases are full of rich context:
- **Markdown documentation (`.md`)**: Architecture decision records, API guides, onboarding docs.
- **Code comments**: Explaining *why* a business rule exists (e.g. `// Deduct beans from bean hopper inventory`).
- **Function and variable names**: Naming patterns that may differ across libraries.

Semantic search connects your natural language thoughts directly to those markdown docs, comments, and code snippets — even when you do not remember the exact function names.

---

## 🛠 What We Built: `code-search-mcp`

Many existing semantic search tools for developers require heavy setups:
- Installing Python 3, virtual environments, and `pip`.
- Running an external background database server (like ChromaDB) listening on a network port.
- Setting up startup daemons (`LaunchAgents` on Mac, Task Scheduler on Windows) that drain battery on boot.
- Adding complex Git hooks (`pre-commit`) that can block your work if the database server is offline.

We wanted something completely different: **Zero setup. Zero external daemons. Works in any project instantly.**

So we built **`code-search-mcp`** — a standalone, cross-platform **Model Context Protocol (MCP)** server for Node.js.

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
│        node_modules/.cache/code-search/                     │
└─────────────────────────────────────────────────────────────┘
```

---

## ⚙️ The Technology Inside

| Component | Technology | Why We Chose It |
|---|---|---|
| **Runtime** | **Node.js + TypeScript** | Cross-platform (macOS, Windows, Linux) with zero runtime dependencies. |
| **Local AI Embeddings** | **`@huggingface/transformers` (ONNX)** | Generates dense 384-dimensional vectors in-process via `Xenova/all-MiniLM-L6-v2`. 100% private — zero network requests. |
| **Vector Storage** | **[LanceDB](https://lancedb.github.io/lancedb/)** | Embedded, serverless vector database built on Apache Arrow. No external server process needed. |
| **Live File Watcher** | **`chokidar`** | Watches files in real-time and updates vectors incrementally within ~200ms when you hit Save. |
| **Protocol** | **`@modelcontextprotocol/sdk`** | Standard MCP protocol supported by Claude Code, Gemini CLI, Cursor, and Windsurf. |

---

## 🔍 How It Works Under the Hood

### 1. How does it know when to start indexing?
When your AI assistant launches (e.g. when you start Claude Code or Gemini CLI), it connects to `code-search-mcp` over standard input/output (`stdio`).
- The MCP server connects **immediately in <15ms**.
- A background worker starts scanning the project files without blocking your chat session.

### 2. Can you search before indexing finishes? (The Mid-Indexing Superpower)
Yes! If you ask a question 2 seconds after opening your project, `code-search-mcp` **never blocks or hangs**. 

It searches whatever files have been indexed so far and provides a live progress header:
```text
⚠️ [Index status: INDEXING (35% complete - 2,100/6,000 files indexed)]
Results from currently indexed files:

### Match 1: src/drinks/espresso.ts (Lines 12-30) [Score: 54.2%]
```

### 3. Where is the index stored?
By default, the database is stored in:
📁 `node_modules/.cache/code-search/lancedb/`

**Why `node_modules/.cache`?**
- `node_modules` is already ignored by Git in 100% of projects.
- **Zero Git noise**: No untracked folders or unwanted diffs ever appear in your repository.
- *(If the project does not have `node_modules`, it cleanly falls back to `.code-search/`)*.

### 4. How does it know which files to skip?
`code-search-mcp` uses a **5-layer ignore engine**:
1. **Built-in System Excludes**: Automatically skips binaries, images (`.png`, `.svg`), videos, audio, build outputs (`dist/`, `build/`), and lockfiles (`package-lock.json`).
2. **`.gitignore`**: Reads and honors your project's `.gitignore` file.
3. **`.ignore`**: Supports ripgrep-style ignore files.
4. **`.codesearchignore`**: Optional file where you can add search-specific ignore rules.
5. **File Size Limit**: Any file larger than 500 KB is automatically skipped to prevent indexing huge generated data blobs.

---

## 🧪 How We Tested It

To ensure rock-solid stability, we built a comprehensive automated test suite with **21 unit and integration tests**:

```bash
npm test
```

### What We Validated:
1. **AST & Line Chunking**: Verified that large files are cleanly split into overlapping code chunks with exact line number tracking.
2. **In-Process ONNX Embeddings**: Verified that local vector generation produces consistent embeddings across operating systems.
3. **LanceDB Vector Search**: Tested cosine similarity search against stored code chunks.
4. **Live In-Process Watcher**: Modified a test file and verified that the index updated automatically within 500ms without restarting.
5. **Real-World Codebase Test**: Tested on a large enterprise repository with over **6,000 source files**, successfully indexing tens of thousands of chunks and retrieving complex business logic in under 50ms.

---

## 📦 How to Install and Use It

You can add `code-search-mcp` to your favorite tool with one command:

### 1. Claude Code
```bash
claude mcp add code-search -s user -- npx -y code-search-mcp
```

### 2. Antigravity CLI (`agy`)
Run this one-liner in your terminal:
```bash
mkdir -p ~/.gemini/config/plugins/code-search && cat << 'INNER' > ~/.gemini/config/plugins/code-search/plugin.json
{ "name": "code-search" }
INNER
cat << 'INNER' > ~/.gemini/config/plugins/code-search/mcp_config.json
{
  "mcpServers": {
    "code-search": {
      "command": "npx",
      "args": ["-y", "code-search-mcp"]
    }
  }
}
INNER
```

### 3. Gemini CLI (`~/.gemini/settings.json`)
```json
{
  "mcpServers": {
    "code-search": {
      "command": "npx",
      "args": ["-y", "code-search-mcp"],
      "trust": true
    }
  }
}
```

### 4. Cursor / Claude Desktop (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "code-search": {
      "command": "npx",
      "args": ["-y", "code-search-mcp", "--path", "${workspaceFolder}"]
    }
  }
}
```

---

## 💡 Summary

By combining **in-process ONNX embeddings** with **embedded LanceDB** and the **Model Context Protocol (MCP)**, we eliminated the friction of local semantic search:

- ✅ **No background daemons** running on your laptop.
- ✅ **No Python/ChromaDB** dependencies.
- ✅ **No Git noise** (stored in `node_modules/.cache`).
- ✅ **Instant search by meaning**, connecting your natural language questions to the exact code and markdown docs you need.

Happy coding! ☕️🚀
