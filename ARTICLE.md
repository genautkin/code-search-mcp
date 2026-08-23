# 🔍 code-search-mcp

> **Zero-daemon local semantic code search MCP server powered by LanceDB and in-process ONNX embeddings.**  
> *Stop grepping for exact words. Give your AI coding assistant the power to search your codebase by meaning.*

Works out-of-the-box with **Claude Code**, **Gemini CLI**, **Antigravity (`agy`)**, and **Cursor** on macOS, Windows, and Linux.

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
When your AI assistant launches (e.g. when you start Claude Code, Antigravity, or Gemini CLI), it connects to `code-search-mcp` over standard input/output (`stdio`).
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

### 3. Be Patient on the First Run — It Only Runs Once! ⏳
On massive repositories with 5,000+ files, the very first indexing scan takes a few minutes because the local AI model is generating vector embeddings for every single chunk of code on your machine for the first time.

**The good news:**
- **You only ever pay this cost once:** The resulting vector database is permanently stored in `node_modules/.cache/code-search/lancedb/`.
- **Instant Subsequent Boot:** On every future session or editor restart, the server connects in **<15ms** without re-indexing.
- **Incremental Live Updates:** As you write code during the day, the live watcher updates only the single file you changed in **~150ms** upon saving.
- **Zero Waiting Required:** You can start asking questions and searching immediately — the assistant will search whatever is already indexed in the background.

### 4. Where is the index stored?
By default, the database is stored in:
📁 `node_modules/.cache/code-search/lancedb/`

**Why `node_modules/.cache`?**
- `node_modules` is already ignored by Git in 100% of projects.
- **Zero Git noise**: No untracked folders or unwanted diffs ever appear in your repository.
- *(If the project does not have `node_modules`, it cleanly falls back to `.code-search/`)*.

---

### 5. What happens when you switch Git branches? 🔀
When you run `git checkout`, `git switch`, or `git pull`:
1. **Live Watcher Detection**: Git updates files on disk, and the built-in `chokidar` file watcher detects the added, modified, or deleted files in real-time.
2. **Fast Differential Re-Scan**: It only re-indexes the specific files that changed between the two branches (taking 1–2 seconds instead of minutes).
3. **Automatic Pruning**: Deleted files or old code chunks from the previous branch are automatically removed from LanceDB.
4. **Manual Sync**: If you ever want to force a clean full rebuild after a massive merge, simply tell your assistant: *"Run `code_search_reindex` with force: true"*.

---

## ⚙️ How to Manage Settings & Ignore More Files

By default, `code-search-mcp` automatically ignores binaries (`.png`, `.mp4`, `.zip`), build outputs (`dist/`, `build/`), lockfiles, and any file over 500 KB, as well as honoring your existing **`.gitignore`**.

If you want to customize settings or ignore extra files for your project, you have two simple options:

### Option 1: Create a `.codesearchignore` File (Quick & Simple)
Create a `.codesearchignore` file in your project root using standard gitignore syntax:

```gitignore
# Ignore mock data and test fixtures
tests/fixtures/**
src/mocks/**

# Ignore auto-generated files
src/models/*.generated.ts
locales/**
```

### Option 2: Create a `.codesearchrc.json` File (Advanced Settings)
Create a `.codesearchrc.json` file in your project root to control indexing behavior, batching, and file size limits:

```json
{
  "maxFileSizeKb": 300,
  "batchSize": 50,
  "customExcludes": [
    "legacy_vendor/**",
    "docs/archive/**"
  ],
  "supportedExtensions": [
    ".ts", ".tsx", ".js", ".vue", ".py", ".md", ".json"
  ]
}
```

---

## 📦 How to Install the Tool

You can install and run the main tool in two simple steps:

### Step 1: Choose Your Installation Method

#### Method A: Zero-Install via `npx` (Recommended)
You don't even need to pre-install the package! Any AI client can execute it on-demand via `npx -y code-search-mcp`.

#### Method B: Global Install (Fastest boot)
If you prefer having the binary cached locally for instant startup:
```bash
npm install -g code-search-mcp
```

#### Method C: From GitHub / Source (For Contributors)
```bash
npm install -g git+https://github.com/your-username/code-search-mcp.git
# or
git clone https://github.com/your-username/code-search-mcp.git
cd code-search-mcp
npm install
npm run build
npm link
```

---

### Step 2: Connect It to Your AI Client

#### 1. Claude Code
Run this single command in your terminal:
```bash
claude mcp add code-search -s user -- npx -y code-search-mcp
```

#### 2. Antigravity CLI (`agy`)
Run this one-liner in your terminal to enable the plugin:
```bash
mkdir -p ~/.gemini/config/plugins/code-search && cat << 'EOF' > ~/.gemini/config/plugins/code-search/plugin.json
{ "name": "code-search" }
EOF
cat << 'EOF' > ~/.gemini/config/plugins/code-search/mcp_config.json
{
  "mcpServers": {
    "code-search": {
      "command": "npx",
      "args": ["-y", "code-search-mcp"]
    }
  }
}
EOF
```

#### 3. Gemini CLI
Add to your `~/.gemini/settings.json`:
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

#### 4. Cursor / Claude Desktop
Add to your `.cursor/mcp.json`:
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

---

## 🤖 Teaching Your AI Agent to Use It Automatically (`CLAUDE.md` / `GEMINI.md` / `.cursorrules`)

## 🤝 The Ultimate AI Pair: Why You Should Install Both `code-search` & `codegraph`

Modern AI coding assistants perform best when equipped with two complementary tools: **Semantic Search** (`code-search-mcp`) and **AST Code Graphs** (`codegraph`).

```
                   ┌─────────────────────────────────────────────────────────┐
                   │  User: "Where is margin calculation handled?"          │
                   └────────────────────────────┬────────────────────────────┘
                                                │
                                                ▼
                   ┌─────────────────────────────────────────────────────────┐
                   │ 1. SEMANTIC SEARCH (code_search)                        │
                   │ • Understands intent, concepts, and natural language     │
                   │ • Finds: margin-reduction-cfd.engine.ts (via JSDoc)     │
                   └────────────────────────────┬────────────────────────────┘
                                                │
                                                ▼
                   ┌─────────────────────────────────────────────────────────┐
                   │ 2. AST CODE GRAPH (codegraph_explore)                   │
                   │ • Understands syntax trees, callers, and blast radius   │
                   │ • Traces: callers into legacy GlobalBuySellData.js       │
                   │ • Discovers: unit test suites (margin-reduction.spec.ts)│
                   └─────────────────────────────────────────────────────────┘
```

### Why One Tool Alone Isn't Enough:

| Tool | Primary Job | What It Does Best | Where It Struggles |
| :--- | :--- | :--- | :--- |
| **`code-search`** *(Semantic Vector)* | **Concept & Intent Discovery** | Finding business logic, features, components, and architectural docs described in plain English. | Traversal across dynamic call hierarchies and legacy unannotated files. |
| **`codegraph`** *(AST Symbol Graph)* | **Structural Navigation & Blast Radius** | Tracing verbatim symbol definitions, callers, callees, and covering unit tests in 1 jump. | Finding concepts described in natural language without knowing symbol names. |

### Real-World Case Study: Modern Engine vs Legacy Monolith

In a real enterprise codebase:
1. **The Modern Engine (`margin-reduction.engine.ts`)** has explicit names (`calculateInitialMarginNeeded`) and rich JSDoc explanations. `code_search` finds it with a **>55% similarity match** in milliseconds.
2. **The Legacy Core (`GlobalBuySellData.js`)** is a 2,000-line file using old terms (`getFundsNeeded`, `SecurityRequired`) or typos (`marginPrecentage`). Semantic search alone might score it lower.
3. **The Synergy**: Once `code_search` lands on `margin-reduction.engine.ts`, `codegraph_explore` immediately traces every caller directly into `GlobalBuySellData.js` and maps the blast radius across covering unit tests without guessing!

### Recommended Dual Configuration

Add both tools to your MCP configuration:

```json
{
  "mcpServers": {
    "code-search": {
      "command": "node",
      "args": ["/path/to/code-search-mcp/dist/bin/cli.js"]
    },
    "codegraph": {
      "command": "codegraph",
      "args": ["mcp"]
    }
  }
}
```

---

## 📋 Recommended Assistant Rules

To ensure your AI assistant picks `code_search` and `codegraph` automatically, add this rule to your project's instruction file (`CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, or `.cursorrules`):

```markdown
## Code Navigation & Search

1. **CodeGraph (`codegraph_explore`)**: Call FIRST when exploring known symbols, tracking call paths, finding usages, or analyzing blast radius (callers + covering tests).
2. **Semantic Search (`code_search`)**: Call FIRST when looking for features, domain behaviors, or business logic described in natural language (e.g. "where is margin calculated", "deposit suggestions formatted").
```

---
## 🧪 How to Verify It Is Working

Once installed, you can verify that `code-search-mcp` is working with three quick checks:

### Check 1: Ask Your AI Assistant for Status
In any chat session with Claude Code, Cursor, or Gemini CLI, ask:
> *"Check `code_search_status`"*

**Expected Output:**
```text
Index Status: READY (or INDEXING)
Progress: 100%
Files: 6,070 / 6,070 indexed
Chunks: 8,204 code chunks in LanceDB
```

### Check 2: Try a Natural Language Code Search
Ask your AI assistant:
> *"Use `code_search` to find how customer discount rules or rewards are handled"*

**Expected Output:**
```text
### Match 1: src/rewards/early-bird.ts (Lines 1-18) [Score: 56.4%]
```
The assistant returns relevant code snippets with exact line numbers and similarity scores instantly.

### Check 3: Test Live File Watching
1. Create a new test file in your project (e.g. `src/drinks/secret-recipe.ts`) with a unique comment:
   ```typescript
   // Caramel macchiato secret syrup blend formula
   export const caramelBlend = 42;
   ```
2. Save the file.
3. Immediately ask your AI assistant:
   > *"Search for secret syrup blend formula using `code_search`"*
4. The new file will be found and returned in **under 1 second** — no manual rebuilds or restart needed!

### Check 4: Run the Automated Test Suite (Optional)
If developing from source, run:
```bash
npm test
```
All **21 unit & integration tests** will execute and pass, verifying the MCP protocol handshake, ONNX vector generation, LanceDB storage, and watcher lifecycle.

---

## 💡 Summary

By combining **in-process ONNX embeddings** with **embedded LanceDB** and the **Model Context Protocol (MCP)**, we eliminated the friction of local semantic search:

- ✅ **No background daemons** running on your laptop.
- ✅ **No Python/ChromaDB** dependencies.
- ✅ **No Git noise** (stored in `node_modules/.cache`).
- ✅ **Instant search by meaning**, connecting your natural language questions to the exact code and markdown docs you need.

Happy coding! ☕️🚀
