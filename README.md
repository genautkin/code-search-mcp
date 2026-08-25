# 🔍 code-search-mcp

> **Zero-daemon local semantic code search MCP server and CLI powered by LanceDB and in-process ONNX embeddings.**  
> *Stop grepping for exact words. Give your AI coding assistant the power to search your codebase by meaning.*

Works out-of-the-box with **Claude Code**, **Gemini CLI**, **Antigravity (`agy`)**, and **Cursor** on macOS, Windows, and Linux.

---

## ⚡️ Quick Start

### 1. Initialize your project
Run the interactive setup wizard in any repository:

```bash
npx code-search-mcp init
```

The wizard asks:
- **Where to store the index** (`node_modules/.cache/code-search/lancedb` for zero git noise, or `.code-search/lancedb`, or custom)
- **Skip indexing files in `.gitignore`** (`Yes` / `No`)
- **Create `.codesearchignore`** with recommended excludes (`Yes` / `No`)
- **Auto-detected file types**: Reviews detected extensions in your repo and lets you customize the list
- **Start initial index immediately** (`Yes` / `No`)

*(Or pass `-y` to skip questions and use smart defaults: `npx code-search-mcp init -y`)*

---

### 2. Connect It to Your AI Client

Because `code-search-mcp` works as a global or local MCP server, configure your AI host:

#### 🧠 Claude Code
```bash
# Global User Install (Available in all projects):
claude mcp add code-search -s user -- code-search-mcp

# Or single project install:
claude mcp add code-search -- code-search-mcp --path /path/to/your/project
```

#### 🤖 Antigravity CLI (`agy`)
```bash
mkdir -p ~/.gemini/config/plugins/code-search && cat << 'EOF' > ~/.gemini/config/plugins/code-search/plugin.json
{ "name": "code-search" }
EOF
cat << 'EOF' > ~/.gemini/config/plugins/code-search/mcp_config.json
{
  "mcpServers": {
    "code-search": {
      "command": "code-search-mcp"
    }
  }
}
EOF
```

#### 🪄 Gemini CLI
Add to `~/.gemini/settings.json` (or workspace `.gemini/settings.json`):
```json
{
  "mcpServers": {
    "code-search": {
      "command": "code-search-mcp",
      "trust": true
    }
  }
}
```

#### 💻 Cursor / Claude Desktop
Add to `.cursor/mcp.json` (or `claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "code-search": {
      "command": "code-search-mcp",
      "args": ["--path", "${workspaceFolder}"]
    }
  }
}
```

---

## 💻 CLI Commands Suite

`code-search-mcp` is both an MCP server and a fast terminal CLI:

| Command | Description |
|---|---|
| `code-search-mcp init [path]` | Interactive setup wizard (use `-y` for non-interactive) |
| `code-search-mcp uninit [path]` | Remove configuration and clean vector database index |
| `code-search-mcp status [path]` | Check index health, total indexed files, chunk counts, and database path |
| `code-search-mcp index [path]` | Rebuild or update the vector index (use `-f` for full clean rebuild) |
| `code-search-mcp search <query>` | Run semantic search directly from your terminal |

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
              │ (Close match!)
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

## 🛠 Architecture & Dormant MCP Mode

Many existing semantic search tools for developers require heavy setups (Python, virtual environments, external background daemons).

`code-search-mcp` is designed around **Explicit Opt-In & Zero Resource Waste**:

- **Dormant by Default**: If a repository does not have `.codesearchrc.json`, the MCP server connects instantly in **<10ms** and stays dormant — zero background workers, zero file watchers, and zero CPU usage until initialized.
- **On-Demand AI Initialization**: If an AI assistant calls `code_search` in an uninitialized repo, it receives clear instructions or can call `code_search_init` directly.
- **In-Process ONNX Embeddings**: Runs `@huggingface/transformers` in-process with `all-MiniLM-L6-v2`. 100% private, zero network calls.
- **Embedded LanceDB**: Serverless, embedded vector database.

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

## ⚙️ Configuration Reference

### `.codesearchrc.json`
Full repository configuration with JSON Schema support:

```json
{
  "$schema": "https://raw.githubusercontent.com/genautkin/code-search-mcp/main/schema.json",
  "version": 1,
  "indexPath": "node_modules/.cache/code-search/lancedb",
  "respectGitignore": true,
  "supportedExtensions": [".ts", ".tsx", ".js", ".vue", ".py", ".md"],
  "customExcludes": [
    "legacy_vendor/**",
    "docs/archive/**"
  ],
  "maxFileSizeKb": 500,
  "embeddingModel": "Xenova/all-MiniLM-L6-v2"
}
```

### `.codesearchignore`
Standard `.gitignore` style glob file for search exclusions:

```gitignore
# Test fixtures and mocks
**/fixtures/**
**/mocks/**
*.snap

# Auto-generated code
*.generated.*
locales/**
```

---

## 🤖 AI Agent Guide & Tool Reference

If you are an AI assistant (Claude Code, Gemini CLI, Cursor, Antigravity, or Windsurf) reading this repository:

### 🛠️ Available MCP Tools

| Tool Name | Arguments | Description | When to Call |
| :--- | :--- | :--- | :--- |
| **`code_search`** | `query` *(required)*<br>`limit` *(optional, default 10)*<br>`pathFilter` *(optional string)*<br>`language` *(optional string)*<br>`codeOnly` *(optional boolean)* | Performs hybrid semantic + lexical search across indexed repository files. Returns line-numbered code chunks with similarity scores. | **FIRST CALL** whenever locating concepts, business logic, workflows, UI components, or features described in natural language. |
| **`code_search_init`** | `indexPath` *(optional)*<br>`respectGitignore` *(optional)*<br>`supportedExtensions` *(optional)* | Initializes semantic search for the repository and builds initial index. | When repository is not yet initialized. |
| **`code_search_status`** | *(none)* | Returns current indexing progress (`READY`, `INDEXING`, `UNINITIALIZED`), percentage, total files, and chunk count in LanceDB. | Check indexing progress. |
| **`code_search_reindex`** | `forceFull` *(optional boolean)* | Triggers a background re-index or complete database rebuild. | After massive merges or when user requests rebuild. |
| **`code_search_guide`** | *(none)* | Returns inline agent usage best practices and tips. | Call to self-discover best practices during tool invocation. |

---

## 🧪 Verification & Testing

To run the automated test suite:
```bash
npm test
```
All **43 unit & integration tests** verify the MCP protocol handshake, ONNX vector generation, LanceDB storage, watcher lifecycle, word stemming, typo correction, init wizard, and dormant mode.

---

## 💡 Summary

- ✅ **Explicit Opt-in**: Dormant until initialized, saving battery and CPU.
- ✅ **Interactive `init` Wizard**: Discovers file types and configures settings with smart defaults.
- ✅ **No background daemons**: Zero external background services or Python dependencies.
- ✅ **Zero Git noise**: Default storage in `node_modules/.cache`.
- ✅ **Handles typos & word variations** automatically in <1ms.
- ✅ **Instant search by meaning**, connecting your natural language questions to the exact code you need.

Happy coding! ☕️🚀
