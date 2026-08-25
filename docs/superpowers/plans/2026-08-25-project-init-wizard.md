# Project Initialization Wizard & Explicit Opt-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement interactive `init` wizard, CLI commands (`init`, `uninit`, `index`, `status`, `search`), dormant MCP server mode, extension auto-detection, and update all documentation.

**Architecture:** 
- Explicit opt-in marker via `.codesearchrc.json` / `.code-search/`.
- Interactive CLI questionnaire in `src/cli/init.ts` using `@inquirer/prompts` with auto-extension scanning and non-interactive `--yes` mode.
- MCP server remains dormant without starting watchers or background jobs if uninitialized, exposing `code_search_init` tool for AI agents.
- Watcher optimization to listen only to configured `supportedExtensions`.

**Tech Stack:** TypeScript, Node.js, Commander, @inquirer/prompts, LanceDB, HuggingFace Transformers, Vitest.

---

### Task 1: Update Types & Config Loader

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config/loader.ts`
- Modify: `src/config/defaults.ts`
- Test: `tests/config/loader.test.ts`

- [x] **Step 1: Write tests for config loader and initialization detection**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Update `src/types.ts`, `src/config/defaults.ts`, and `src/config/loader.ts`**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: File Extension Auto-Detector

**Files:**
- Create: `src/cli/detector.ts`
- Test: `tests/cli/detector.test.ts`

- [x] **Step 1: Write tests for extension auto-detector**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Implement `src/cli/detector.ts`**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: Interactive & Non-Interactive `init` and `uninit` Commands

**Files:**
- Create: `src/cli/init.ts`
- Create: `src/cli/uninit.ts`
- Test: `tests/cli/init.test.ts`

- [x] **Step 1: Write tests for `init` and `uninit` functions**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Implement `src/cli/init.ts` and `src/cli/uninit.ts`**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: CLI Commands Suite (`index`, `status`, `search`, `cli.ts`)

**Files:**
- Create: `src/cli/status.ts`
- Create: `src/cli/search.ts`
- Create: `src/cli/index-cmd.ts`
- Modify: `bin/cli.ts`
- Test: `tests/cli/commands.test.ts`

- [x] **Step 1: Write integration tests for CLI commands**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Implement `src/cli/status.ts`, `src/cli/search.ts`, `src/cli/index-cmd.ts`, and wire into `bin/cli.ts`**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: MCP Server Dormant Mode & `code_search_init` Tool

**Files:**
- Modify: `src/server/mcp.ts`
- Modify: `src/indexer/watcher.ts`
- Test: `tests/server/mcp-dormant.test.ts`

- [x] **Step 1: Write test for dormant mode and `code_search_init` MCP tool**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Implement dormant mode, `code_search_init` tool in `src/server/mcp.ts`, and watcher extension filtering in `src/indexer/watcher.ts`**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 6: Documentation & Guide Updates

**Files:**
- Create: `schema.json`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-25-project-init-wizard.md`

- [x] **Step 1: Create `schema.json`**
- [x] **Step 2: Update `README.md`**
- [x] **Step 3: Run full test suite & build validation**
- [x] **Step 4: Commit**

