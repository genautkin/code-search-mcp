# 📦 Complete Installation Guide

`code-search-mcp` is a zero-daemon semantic code search MCP server that works across macOS, Windows, and Linux.

---

## ⚡️ Step 1: Install the Server

### Global Install directly from GitHub (Recommended — No NPM Publish Needed):
```bash
npm install -g github:genautkin/code-search-mcp
```
*(To update later, just run the same command again).*

### Or Local Development / Linked (For Contributors):
```bash
cd /path/to/code-search-mcp
npm install
npm run build
npm link
```

---

## ⚡️ Step 2: Configure by AI Client

Because `code-search-mcp` runs as a direct binary, it avoids wrapper overhead (`npx`/`npm exec`) and terminates instantly without leaving stale background processes.

### 1. 🧠 Claude Code

#### Global User Install (Available across all projects):
```bash
claude mcp add code-search -s user -- code-search-mcp
```

#### Single Project Install:
```bash
claude mcp add code-search -- code-search-mcp --path /path/to/your/project
```

---

### 2. 🤖 Antigravity CLI (`agy`)

Antigravity loads plugins from `~/.gemini/config/plugins/`.

#### One-Liner Install (Terminal):
```bash
mkdir -p ~/.gemini/config/plugins/code-search && cat << 'INNER' > ~/.gemini/config/plugins/code-search/plugin.json
{
  "name": "code-search"
}
INNER
cat << 'INNER' > ~/.gemini/config/plugins/code-search/mcp_config.json
{
  "mcpServers": {
    "code-search": {
      "command": "code-search-mcp"
    }
  }
}
INNER
```

---

### 3. 🪄 Gemini CLI

Add to your global `~/.gemini/settings.json` (or workspace `.gemini/settings.json`):

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

---

### 4. 💻 Cursor IDE / Claude Desktop

Add to `.cursor/mcp.json` or `claude_desktop_config.json`:

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

### 💡 Why Direct Execution?
Running `code-search-mcp` directly (rather than via `npx` or `npm exec`) gives the host direct process control:
- Instant shutdown in `<5ms` upon reload or exit.
- Prevents detached wrapper child processes from lingering in the background.

---

## 🧪 Verification

To verify that the MCP server is responding properly in any project:
1. Ask your agent: `"What is the code_search_status?"`
2. Ask your agent: `"Search for where user authentication is handled using code_search"`
