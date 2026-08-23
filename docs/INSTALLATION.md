# 📦 Complete Installation Guide

`code-search-mcp` is a zero-daemon semantic code search MCP server that works across macOS, Windows, and Linux.

---

## ⚡️ Quick Installation by Client

### 1. 🤖 Antigravity CLI (`agy`)

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
      "command": "npx",
      "args": ["-y", "github:your-username/code-search-mcp"]
    }
  }
}
INNER
```

#### Manual Configuration:
Create `~/.gemini/config/plugins/code-search/` containing:
- **`plugin.json`**: `{"name": "code-search"}`
- **`mcp_config.json`**:
  ```json
  {
    "mcpServers": {
      "code-search": {
        "command": "npx",
        "args": ["-y", "github:your-username/code-search-mcp"]
      }
    }
  }
  ```

---

### 2. 🪄 Gemini CLI

Add to your global `~/.gemini/settings.json` (or workspace `.gemini/settings.json`):

```json
{
  "mcpServers": {
    "code-search": {
      "command": "npx",
      "args": ["-y", "github:your-username/code-search-mcp"],
      "trust": true
    }
  }
}
```

---

### 3. 🧠 Claude Code

#### Global User Install (Available across all projects):
```bash
claude mcp add code-search -s user -- npx -y github:your-username/code-search-mcp
```

#### Single Project Install:
```bash
claude mcp add code-search -- npx -y github:your-username/code-search-mcp --path /path/to/your/project
```

---

### 4. 💻 Cursor IDE / Claude Desktop

Add to `.cursor/mcp.json` or `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "code-search": {
      "command": "npx",
      "args": ["-y", "github:your-username/code-search-mcp", "--path", "${workspaceFolder}"]
    }
  }
}
```

---

## 🛠 Local Development Mode (Before Publishing to npm)

If you are developing or testing `code-search-mcp` locally before publishing to npm:

```bash
cd /path/to/code-search-mcp
npm run build
npm link
```

Then replace `"npx", "-y", "code-search-mcp"` with `"code-search-mcp"` or `"/usr/local/bin/code-search-mcp"`.

---

## 🧪 Verification

To verify that the MCP server is responding properly in any project:
1. Ask your agent: `"What is the code_search_status?"`
2. Ask your agent: `"Search for where user authentication is handled using code_search"`
