# 🔄 Migration Guide: Moving from VectorCode / ChromaDB to `code-search-mcp`

If you are replacing a legacy Python-based `vectorcode` and ChromaDB setup, this guide outlines the key differences and optional cleanup steps.

---

## ⚖️ Architecture Comparison

| Feature | Legacy `vectorcode` | Modern `code-search-mcp` |
|---|---|---|
| **Runtime** | Python 3.12 + pipx | Node.js (v18+) |
| **Vector DB** | External ChromaDB server (port 8000) | In-process LanceDB (`.code-search/`) |
| **OS Daemons** | macOS `LaunchAgent` / systemd | **None (Zero daemons)** |
| **File Updates** | Git hooks (`pre-commit`, `post-checkout`) | Live in-process watcher (`chokidar`) |
| **Client Startup** | Can block/fail if ChromaDB is down | Instant (<15ms) MCP stdio boot |
| **Cross-Platform** | Tree-sitter ABI compatibility issues on ARM64 | Native cross-platform ONNX runtime |

---

## 🧹 Optional Legacy Cleanup

If you want to remove the old ChromaDB background service and free system resources:

### 1. Stop & Remove the ChromaDB LaunchAgent (macOS)
```bash
# Unload service from launchd
launchctl bootout gui/$(id -u)/com.vectorcode.chromadb 2>/dev/null || launchctl unload ~/Library/LaunchAgents/com.vectorcode.chromadb.plist 2>/dev/null

# Remove plist file
rm -f ~/Library/LaunchAgents/com.vectorcode.chromadb.plist

# Terminate process
pkill -f "chromadb.cli" 2>/dev/null || true
```

### 2. Clean Git Hooks (If previously installed)
Remove any `# VECTORCODE_HOOK_START` blocks from:
- `.git/hooks/pre-commit`
- `.git/hooks/post-checkout`

### 3. Remove Old Data Folders
```bash
rm -rf ~/.local/share/vectorcode
rm -rf ~/.config/vectorcode
pipx uninstall vectorcode 2>/dev/null || true
```
