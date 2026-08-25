# Project Initialization Wizard & Explicit Opt-In Design

**Date**: 2026-08-25  
**Status**: Draft  
**Target System**: `code-search-mcp` CLI & MCP Server

---

## 1. Overview & Problem Statement

Currently, `code-search-mcp` automatically starts indexing whenever the MCP server starts in any directory. When an AI client (Claude Code, Gemini CLI, Cursor, Antigravity) runs with the MCP server configured globally, background scanning and vector embedding run unprompted across every open folder. This burns CPU/RAM on repositories where semantic search is not desired and doesn't give developers a chance to configure ignores or choose index locations before indexing begins.

Following the model established by tools like `codegraph`, `code-search-mcp` will transition to an **explicit opt-in architecture**:
1. Semantic search is initialized intentionally via an interactive CLI setup wizard (`code-search init`).
2. An MCP server running in an uninitialized directory remains **dormant** (0 CPU / 0 background work).
3. The initialization wizard auto-detects existing file types, lets the user review/customize extensions and ignore rules, sets up `.codesearchrc.json` and `.codesearchignore`, and safely protects Git repositories.

---

## 2. CLI Architecture & Commands

The CLI (`bin/cli.ts` / `code-search`) will support the following commands:

```
Usage: code-search [command] [options]

Commands:
  init [path]            Initialize code-search in a project with an interactive setup wizard
  uninit [path]          Remove code-search configuration and delete local vector index
  index [path]           Rebuild or update the search index for an initialized project
  status [path]          Show index health, file counts, and vector store statistics
  search <query>         Execute a semantic search query directly in the terminal
  help [command]         Show command help
```

---

## 3. Interactive `init` Wizard Flow

Running `npx code-search-mcp init [path]` (or `code-search init`) executes an interactive terminal questionnaire using `@inquirer/prompts` (or built-in `readline`):

```
┌─────────────────────────────────────────────────────────────┐
│              code-search-mcp Project Initialization         │
└─────────────────────────────────────────────────────────────┘
```

### Step-by-Step Questionnaire

1. **Existing Setup Check** *(if `.codesearchrc.json` or an index directory already exists)*:
   * **Question**: `"Existing configuration / index detected. Clean and rebuild from scratch?"`
   * **Default**: `No`
   * **Options**: `No (keep existing index)` / `Yes (wipe and rebuild)`

2. **Index Storage Location**:
   * **Question**: `"Where should the vector database index be stored?"`
   * **Options**:
     1. `node_modules/.cache/code-search` *(Default if `node_modules/` exists — keeps git status completely clean)*
     2. `.code-search/` *(Standard root folder)*
     3. `Custom path...` *(Prompt user for directory path)*

3. **Respect `.gitignore`**:
   * **Question**: `"Skip indexing files listed in your project's .gitignore?"`
   * **Default**: `Yes`
   * **Options**: `Yes (recommended)` / `No (index gitignored files unless excluded by .codesearchignore)`

4. **Search Ignore File (`.codesearchignore`)**:
   * **Question**: `"Create a .codesearchignore file with recommended excludes (fixtures, mocks, build artifacts)?"`
   * **Default**: `Yes`
   * **Options**: `Yes` / `No`

5. **File Extension Auto-Detection & Customization**:
   * Scans the project directory (respecting ignores) to discover all existing file extensions and their frequencies.
   * **Display**:
     ```
     🔍 Detected project file types:
        .ts (124 files), .tsx (45 files), .json (12 files), .md (6 files), .css (4 files)
     ```
   * **Question**: `"Use detected extensions: [.ts, .tsx, .json, .md, .css]?"`
   * **Options**:
     1. `Yes, use detected extensions` *(Default)*
     2. `Edit list (customize extensions manually)`
   * If `Edit list` is selected: prompts with the comma-separated detected list as an editable default string so the user can add or remove items.

6. **Gitignore Protection**:
   * If the chosen index path resides inside the repository (e.g. `.code-search/` or custom root directory) and `.gitignore` exists:
   * Checks if the path is already ignored by Git. If not, automatically appends `.code-search/` to `.gitignore`.

7. **Initial Indexing**:
   * **Question**: `"Start initial indexing now?"`
   * **Default**: `Yes`
   * **Options**: `Yes (build vector index now)` / `No (save configuration and index later)`
   * If **Yes**: Displays a real-time progress indicator while chunking and embedding files.

### Non-Interactive / CI Mode (`--yes` / `-y`)
Running `code-search init -y` bypasses all prompts and automatically applies smart defaults:
* Storage: `node_modules/.cache/code-search` (if `node_modules` exists) else `.code-search/`
* `respectGitignore: true`
* Creates `.codesearchignore`
* Auto-detects extensions
* Builds the initial index immediately.

---

## 4. Configuration Schema (`.codesearchrc.json`)

Running `init` writes the project configuration file:

```json
{
  "$schema": "https://raw.githubusercontent.com/genautkin/code-search-mcp/main/schema.json",
  "version": 1,
  "indexPath": "node_modules/.cache/code-search/lancedb",
  "respectGitignore": true,
  "supportedExtensions": [".ts", ".tsx", ".json", ".md"],
  "customExcludes": [],
  "maxFileSizeKb": 500,
  "embeddingModel": "Xenova/all-MiniLM-L6-v2"
}
```

---

## 5. MCP Server Dormant Mode & Agent Interoperability

When `code-search-mcp` starts as an MCP server via stdio:

1. **Initialization Detection**:
   * Checks if `.codesearchrc.json` (or `.code-search/`) exists in the project root.
2. **If Uninitialized**:
   * The server runs in **Dormant Mode**: no file watcher is started, no ONNX embeddings are loaded into memory, no background scan runs.
   * `code_search` tool returns a structured guide:
     ```text
     ℹ️ Semantic code search is not initialized for this project.
     Run `npx code-search-mcp init` in your terminal, or ask me to initialize it using the `code_search_init` tool.
     ```
   * Exposes a `code_search_init` MCP tool:
     * Accepts optional parameters (`indexPath`, `respectGitignore`, `supportedExtensions`).
     * Scaffolds the configuration and triggers the initial index if requested by the AI agent.
3. **If Initialized**:
   * Loads `.codesearchrc.json`.
   * Starts `chokidar` file watcher filtered strictly to the configured `supportedExtensions`.
   * Serves search queries immediately from the pre-built LanceDB index.

---

## 6. File Watcher & Scanning Performance Optimization

1. **Watcher Glob Optimization**:
   * Instead of watching all files (`**/*`), the watcher pattern is restricted to:
     `**/*.{ts,tsx,json,md}` based on `supportedExtensions`.
   * File-system events for ignored file types (images, temp files, binary assets) are discarded at the OS event level.
2. **Scan Ignore Ordering**:
   * Step 1: Built-in system excludes + `.gitignore` (if `respectGitignore: true`) + `.codesearchignore`. (Subdirectories pruned immediately).
   * Step 2: Extension filter matching `supportedExtensions`.
   * Step 3: File size constraint (`<= maxFileSizeKb`).
   * Step 4: Content/Timestamp delta check for incremental embedding.

---

## 7. Testing Strategy

1. **Unit Tests**:
   * `init` logic with mock filesystem (verifying `.codesearchrc.json`, `.codesearchignore`, and `.gitignore` updates).
   * Extension discovery scanner logic across multi-language fixture directories.
   * Dormant mode behavior verification (ensuring no background processes start when uninitialized).
2. **Integration Tests**:
   * CLI command suite: `init -y`, `status`, `index`, `search`, `uninit`.
   * MCP protocol tool calls: `code_search` on uninitialized repo vs initialized repo, and `code_search_init` execution.
