# Legacy VectorCode Cleanup & Post-Switch Verification Plan

This document provides a comprehensive step-by-step guide to:
1. **Completely remove legacy `vectorcode` / ChromaDB components** (startup daemons, LaunchAgents, pipx environments, git hooks, and local vector caches).
2. **Configure the new `code-search-mcp` package** for your AI agents (Claude Code, Gemini CLI, Cursor).
3. **Execute end-to-end verification tests** to ensure reliable zero-daemon operation.

---

## 🧹 Part 1: Legacy Cleanup Checklist

### 1. Stop & Remove Startup Daemons (`LaunchAgents`)
The previous ChromaDB instance started automatically on macOS user login.

- **Check if running**:
  ```bash
  launchctl list | grep vectorcode
  ps aux | grep -i chromadb
  ```
- **Stop & Remove**:
  ```bash
  # Unload service from macOS user domain
  launchctl bootout gui/$(id -u)/com.vectorcode.chromadb 2>/dev/null || launchctl unload ~/Library/LaunchAgents/com.vectorcode.chromadb.plist 2>/dev/null

  # Delete the LaunchAgent plist definition
  rm -f ~/Library/LaunchAgents/com.vectorcode.chromadb.plist

  # Terminate any remaining ChromaDB processes
  pkill -f "chromadb.cli" 2>/dev/null || true
  ```

---

### 2. Remove Old MCP Registrations

- **Claude Code**:
  ```bash
  # Remove vectorcode from user/global and local scopes
  claude mcp remove vectorcode -s user 2>/dev/null || true
  claude mcp remove vectorcode 2>/dev/null || true
  ```

- **Gemini CLI (`~/.gemini/settings.json`)**:
  Remove the `vectorcode` entry from `mcpServers`:
  ```json
  // Before:
  "mcpServers": {
    "vectorcode": { ... },
    ...
  }
  // After: remove "vectorcode" key
  ```

---

### 3. Clean Git Hooks in Repositories
The previous setup injected pre-commit and post-checkout hooks that blocked commits if ChromaDB was offline.

- **In `.git/hooks/pre-commit`**:
  Remove the section between:
  ```bash
  # VECTORCODE_HOOK_START
  ...
  # VECTORCODE_HOOK_END
  ```
  *(Keep CodeGraph, linter, or pre-commit checks intact).*

- **In `.git/hooks/post-checkout`**:
  Remove the `vectorcode vectorise` loop.

---

### 4. Uninstall Python Environment & Cache

- **Remove pipx installation**:
  ```bash
  pipx uninstall vectorcode 2>/dev/null || true
  rm -rf ~/.local/pipx/venvs/vectorcode
  ```

- **Delete database files and configurations (~400MB+)**:
  ```bash
  rm -rf ~/.local/share/vectorcode
  rm -rf ~/.config/vectorcode
  ```

- **Remove repository-level `.vectorcode` directory**:
  ```bash
  rm -rf /Users/gennadiy.utkin/Documents/Dev/WebApp/IVS.WebApp/IVS.WebApp/.vectorcode
  rm -rf /Users/gennadiy.utkin/Documents/Dev/WebApp/.vectorcode
  ```

---

## 🚀 Part 2: Registering `code-search-mcp`

### Option A: Local Dev / Direct Link (Immediate, before npm publish)
```bash
# 1. Build and link locally
cd /Users/gennadiy.utkin/Documents/code/code-search-mcp
npm run build
npm link

# 2. Add to Claude Code
claude mcp add code-search -s user -- /Users/gennadiy.utkin/Documents/code/code-search-mcp/dist/bin/cli.js

# 3. Add to Gemini CLI (~/.gemini/settings.json)
"code-search": {
  "command": "node",
  "args": ["/Users/gennadiy.utkin/Documents/code/code-search-mcp/dist/bin/cli.js"]
}
```

### Option B: From npm (After `npm publish`)
```bash
# Claude Code (Global across all projects)
claude mcp add code-search -s user -- npx -y code-search-mcp

# Gemini CLI (~/.gemini/settings.json)
"code-search": {
  "command": "npx",
  "args": ["-y", "code-search-mcp"]
}
```

---

## 🧪 Part 3: Post-Switch Test Plan

Execute these 5 test scenarios to verify functionality:

### 1. Scenario 1: Clean Startup (<200ms, No Background Daemons)
- **Action**: Open an agent session in `IVS.WebApp`.
- **Validation**:
  1. Confirm process table has no ChromaDB: `ps aux | grep -i chromadb` (empty).
  2. Confirm tool is available: Call `code_search_status`.
  3. Status should show:
     ```text
     Index Status: SCANNING (or INDEXING / READY)
     Progress: X%
     Files: X / Y indexed
     ```

### 2. Scenario 2: Semantic Search During Initial Indexing
- **Action**: While initial index is building, run a natural query:
  `code_search query="user authentication token verification"`
- **Validation**:
  1. Tool returns matches immediately without waiting for full repo indexing to finish.
  2. Results include the header banner informing the agent of current progress:
     ```text
     ⚠️ [Index status: INDEXING (35% complete - 1,820/5,200 files indexed)]
     Results from currently indexed files:
     ...
     ```

### 3. Scenario 3: Live Incremental File Watcher (No Git Hooks)
- **Action**:
  1. Open any source file in your editor (e.g. `src/services/sample-auth.ts`).
  2. Add a new function:
     ```typescript
     export function verifyBiometricFaceUnlockId(credentialId: string) {
       return credentialId.startsWith('bio_');
     }
     ```
  3. Save the file.
- **Validation**:
  1. Within 1-2 seconds, query `code_search query="face unlock biometric verification"`.
  2. Result must return `src/services/sample-auth.ts` pointing to `verifyBiometricFaceUnlockId`.
  3. No git commit or manual command was required.

### 4. Scenario 4: Layered Ignore Rules (`.codesearchignore` / `.gitignore`)
- **Action**:
  1. Create `.codesearchignore` in project root:
     ```
     tests/fixtures/**
     *.mock.ts
     ```
- **Validation**:
  1. Query `code_search` for strings only found in fixture/mock files.
  2. Confirm they are excluded from indexing and search results.

### 5. Scenario 5: Clean Exit & Differential Re-check
- **Action**:
  1. Close the Claude/Gemini session.
  2. Verify no orphan processes remain: `ps aux | grep code-search-mcp` (empty).
  3. Re-open session in same project.
- **Validation**:
  1. Startup indexer reads existing LanceDB storage at `.code-search/lancedb`.
  2. Scans mtime hashes in <1 second and reaches `READY` status instantly without re-embedding unchanged files.
