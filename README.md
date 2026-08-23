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

---

## 📦 Quick Start / Easy Installation

`code-search-mcp` can be installed in seconds into any AI coding assistant with zero background daemons.

### 1. Claude Code
Install globally across all projects with a single command:
```bash
claude mcp add code-search -s user -- npx -y code-search-mcp
```
*(Or for local development before npm publish: `claude mcp add code-search -s user -- /path/to/code-search-mcp/dist/bin/cli.js`)*

---

### 2. Antigravity CLI (`agy`)

#### Option A: Quick One-Liner (Recommended)
Run this command in your terminal to automatically register the plugin:
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

#### Option B: Via `~/.gemini/config/mcp_config.json`
Add the server entry to `~/.gemini/config/mcp_config.json`:
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

---

### 3. Gemini CLI
Add to your global `~/.gemini/settings.json` (or workspace `.gemini/settings.json`):
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

---

### 4. Cursor / Claude Desktop / Custom MCP Clients
Add to your project's `.cursor/mcp.json` or client configuration:
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
