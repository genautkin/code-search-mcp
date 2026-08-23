# code-search-mcp

> 🚀 **Zero-daemon, cross-platform local semantic code search MCP server.**
> 
> Works out-of-the-box with **Claude Code**, **Gemini CLI**, and **Cursor** on **macOS**, **Windows**, and **Linux**.

---

## ✨ Features

- **⚡️ Zero External Daemons**: No Python, no ChromaDB servers, no LaunchAgents/Task Scheduler, and no API keys required. Everything runs 100% locally in-process via Node.js.
- **🔍 High-Accuracy Semantic Search**: In-process ONNX embeddings (`Xenova/all-MiniLM-L6-v2`) and embedded vector database powered by [LanceDB](https://lancedb.github.io/lancedb/).
- **📊 Real-Time Indexing Progress**: If a query is issued while initial indexing is running, results are returned from currently indexed chunks alongside a live progress banner (`[Index status: 45% (2,250/5,000 files)]`).
- **👀 Live Incremental File Watcher**: Auto-updates vector embeddings on file save without needing full rebuilds or manual git hooks.
- **🛡 Layered Excludes**: Automatically respects `.gitignore`, `.ignore`, global defaults (binary files, build artifacts, lockfiles), and project-specific `.codesearchignore` / `.codesearchrc.json`.

---

## 📦 Quick Start / Installation

### 1. Claude Code
Add as a user MCP server (available across all your projects):

```bash
claude mcp add code-search -s user -- npx -y code-search-mcp
```

Or for a specific project directory:
```bash
claude mcp add code-search -- npx -y code-search-mcp --path /path/to/project
```

### 2. Gemini CLI
Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "code-search": {
      "command": "npx",
      "args": ["-y", "code-search-mcp"]
    }
  }
}
```

### 3. Cursor / Claude Desktop / Custom MCP Clients
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

## 🛠 Available MCP Tools

| Tool | Parameters | Description |
|---|---|---|
| `code_search` | `query: string`, `limit?: number` | Performs semantic search across the codebase and returns relevant code snippets with line numbers. |
| `code_search_status` | *none* | Returns indexing state (`idle`, `scanning`, `indexing`, `ready`), progress percentage, and indexed file count. |
| `code_search_reindex` | `forceFull?: boolean` | Triggers a background re-index or complete rebuild. |

---

## ⚙️ Configuration (Optional)

Create a `.codesearchrc.json` file in your project root to customize behavior:

```json
{
  "batchSize": 50,
  "maxFileSizeKb": 500,
  "embeddingModel": "Xenova/all-MiniLM-L6-v2",
  "customExcludes": [
    "legacy_vendor/**",
    "*.generated.ts"
  ]
}
```

You can also create a `.codesearchignore` file using standard `.gitignore` syntax to exclude specific folders.

---

## 🚀 Publishing to npm

To publish this package to the npm registry:

```bash
# 1. Build and verify all tests
npm run prepublishOnly

# 2. Login to npm (if not already logged in)
npm login

# 3. Publish (public access)
npm publish --access public
```

---

## 📄 License
MIT © 2026
