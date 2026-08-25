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

- [ ] **Step 1: Write tests for config loader and initialization detection**

```typescript
// tests/config/loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { isProjectInitialized, loadConfig, createIgnoreMatcher } from '../../src/config/loader.js';

describe('config loader & initialization checks', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codesearch-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects uninitialized project when no .codesearchrc.json or .code-search exists', () => {
    expect(isProjectInitialized(tempDir)).toBe(false);
  });

  it('detects initialized project when .codesearchrc.json exists', () => {
    fs.writeFileSync(path.join(tempDir, '.codesearchrc.json'), JSON.stringify({ version: 1 }));
    expect(isProjectInitialized(tempDir)).toBe(true);
  });

  it('detects initialized project when .code-search directory exists', () => {
    fs.mkdirSync(path.join(tempDir, '.code-search'));
    expect(isProjectInitialized(tempDir)).toBe(true);
  });

  it('loads config with respectGitignore = false when specified', () => {
    fs.writeFileSync(
      path.join(tempDir, '.codesearchrc.json'),
      JSON.stringify({ respectGitignore: false, customExcludes: ['custom/**'] })
    );
    const config = loadConfig(tempDir);
    expect(config.respectGitignore).toBe(false);
    expect(config.customExcludes).toContain('custom/**');
  });

  it('honors respectGitignore flag in createIgnoreMatcher', () => {
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'ignored-by-git.ts\n');
    const matcherWithGit = createIgnoreMatcher(tempDir, [], true);
    const matcherWithoutGit = createIgnoreMatcher(tempDir, [], false);

    expect(matcherWithGit.ignores('ignored-by-git.ts')).toBe(true);
    expect(matcherWithoutGit.ignores('ignored-by-git.ts')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/loader.test.ts`
Expected: FAIL with missing functions / properties.

- [ ] **Step 3: Update `src/types.ts`, `src/config/defaults.ts`, and `src/config/loader.ts`**

Update `src/types.ts`:
```typescript
export interface CodeSearchConfig {
  projectRoot: string;
  dbPath: string;
  embeddingModel: string;
  batchSize: number;
  maxFileSizeKb: number;
  supportedExtensions: string[];
  customExcludes: string[];
  respectGitignore: boolean;
  queryMultiplier: number;
  searchEf: number;
}
```

Update `src/config/loader.ts` to export `isProjectInitialized`, support `respectGitignore`, and handle custom `indexPath`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config/loader.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/config/defaults.ts src/config/loader.ts tests/config/loader.test.ts
git commit -m "feat(config): add isProjectInitialized helper and respectGitignore support"
```

---

### Task 2: File Extension Auto-Detector

**Files:**
- Create: `src/cli/detector.ts`
- Test: `tests/cli/detector.test.ts`

- [ ] **Step 1: Write tests for extension auto-detector**

```typescript
// tests/cli/detector.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { detectProjectExtensions } from '../../src/cli/detector.js';

describe('detectProjectExtensions', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codesearch-detect-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects and counts common source code extensions in project', () => {
    fs.writeFileSync(path.join(tempDir, 'index.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(tempDir, 'app.tsx'), 'export const App = () => null;');
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Readme');
    fs.writeFileSync(path.join(tempDir, 'test.bin'), 'binary');

    const result = detectProjectExtensions(tempDir);
    expect(result.extensions).toContain('.ts');
    expect(result.extensions).toContain('.tsx');
    expect(result.extensions).toContain('.md');
    expect(result.counts['.ts']).toBe(1);
    expect(result.counts['.tsx']).toBe(1);
    expect(result.counts['.md']).toBe(1);
    // Non-code or excluded binaries should be filtered out
    expect(result.extensions).not.toContain('.bin');
  });

  it('respects .gitignore during extension detection if requested', () => {
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'dist/**\n');
    fs.mkdirSync(path.join(tempDir, 'dist'));
    fs.writeFileSync(path.join(tempDir, 'dist', 'bundle.js'), 'var a = 1;');
    fs.writeFileSync(path.join(tempDir, 'main.go'), 'package main');

    const result = detectProjectExtensions(tempDir, { respectGitignore: true });
    expect(result.extensions).toContain('.go');
    expect(result.extensions).not.toContain('.js');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/detector.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/cli/detector.ts`**

Implement `detectProjectExtensions(projectRoot: string, options?: { respectGitignore?: boolean })` using `fs.readdirSync` with ignore matcher and recognized extension dictionary.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli/detector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/detector.ts tests/cli/detector.test.ts
git commit -m "feat(cli): add project file extension auto-detection"
```

---

### Task 3: Interactive & Non-Interactive `init` and `uninit` Commands

**Files:**
- Create: `src/cli/init.ts`
- Create: `src/cli/uninit.ts`
- Test: `tests/cli/init.test.ts`

- [ ] **Step 1: Write tests for `init` and `uninit` functions**

```typescript
// tests/cli/init.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runInit } from '../../src/cli/init.js';
import { runUninit } from '../../src/cli/uninit.js';

describe('runInit & runUninit', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codesearch-init-test-'));
    fs.writeFileSync(path.join(tempDir, 'main.ts'), 'console.log("hello");');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates .codesearchrc.json and .codesearchignore in non-interactive mode (-y)', async () => {
    await runInit({
      projectRoot: tempDir,
      yes: true,
      skipIndex: true
    });

    const rcPath = path.join(tempDir, '.codesearchrc.json');
    const ignorePath = path.join(tempDir, '.codesearchignore');

    expect(fs.existsSync(rcPath)).toBe(true);
    expect(fs.existsSync(ignorePath)).toBe(true);

    const rc = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
    expect(rc.supportedExtensions).toContain('.ts');
    expect(rc.respectGitignore).toBe(true);
  });

  it('adds .code-search to .gitignore if index is placed in root and not already ignored', async () => {
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'node_modules/\n');

    await runInit({
      projectRoot: tempDir,
      yes: true,
      indexPath: '.code-search/lancedb',
      skipIndex: true
    });

    const gitignore = fs.readFileSync(path.join(tempDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.code-search/');
  });

  it('uninit cleans up config, ignore file, and index folder', async () => {
    await runInit({
      projectRoot: tempDir,
      yes: true,
      indexPath: '.code-search/lancedb',
      skipIndex: true
    });

    await runUninit(tempDir);

    expect(fs.existsSync(path.join(tempDir, '.codesearchrc.json'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, '.codesearchignore'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, '.code-search'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/init.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/cli/init.ts` and `src/cli/uninit.ts`**

Implement `@inquirer/prompts` questionnaire for interactive terminal sessions and direct option resolution when `options.yes` is `true`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli/init.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/init.ts src/cli/uninit.ts tests/cli/init.test.ts
git commit -m "feat(cli): implement init wizard and uninit commands"
```

---

### Task 4: CLI Commands Suite (`index`, `status`, `search`, `cli.ts`)

**Files:**
- Create: `src/cli/status.ts`
- Create: `src/cli/search.ts`
- Create: `src/cli/index-cmd.ts`
- Modify: `bin/cli.ts`
- Test: `tests/cli/commands.test.ts`

- [ ] **Step 1: Write integration tests for CLI commands**

```typescript
// tests/cli/commands.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runInit } from '../../src/cli/init.js';
import { runStatus } from '../../src/cli/status.js';
import { runSearch } from '../../src/cli/search.js';

describe('CLI commands (status, search)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codesearch-cli-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('shows uninitialized message when status is run on uninitialized project', async () => {
    const status = await runStatus(tempDir);
    expect(status.initialized).toBe(false);
  });

  it('returns status info when project is initialized', async () => {
    await runInit({ projectRoot: tempDir, yes: true, skipIndex: true });
    const status = await runStatus(tempDir);
    expect(status.initialized).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/commands.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/cli/status.ts`, `src/cli/search.ts`, `src/cli/index-cmd.ts`, and wire into `bin/cli.ts`**

Update `bin/cli.ts` with Commander subcommands:
`init`, `uninit`, `index`, `status`, `search`, and default MCP server launch.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli/commands.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/status.ts src/cli/search.ts src/cli/index-cmd.ts bin/cli.ts tests/cli/commands.test.ts
git commit -m "feat(cli): wire up full CLI command suite"
```

---

### Task 5: MCP Server Dormant Mode & `code_search_init` Tool

**Files:**
- Modify: `src/server/mcp.ts`
- Modify: `src/indexer/watcher.ts`
- Test: `tests/server/mcp-dormant.test.ts`

- [ ] **Step 1: Write test for dormant mode and `code_search_init` MCP tool**

```typescript
// tests/server/mcp-dormant.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createMcpServer } from '../../src/server/mcp.js';
import { loadConfig } from '../../src/config/loader.js';

describe('MCP Server dormant mode & init tool', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codesearch-mcp-dormant-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns uninitialized guide when querying an uninitialized project', async () => {
    const config = loadConfig(tempDir);
    const { server, start, stop } = await createMcpServer(config);

    // Call code_search tool handler
    // Verify it returns guide instructions to initialize project
    await stop();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/mcp-dormant.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement dormant mode, `code_search_init` tool in `src/server/mcp.ts`, and watcher extension filtering in `src/indexer/watcher.ts`**

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/mcp-dormant.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/mcp.ts src/indexer/watcher.ts tests/server/mcp-dormant.test.ts
git commit -m "feat(mcp): implement dormant mode for uninitialized repos and code_search_init tool"
```

---

### Task 6: Documentation & Guide Updates

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/INSTALLATION.md`
- Modify: `ARTICLE.md`

- [ ] **Step 1: Update `README.md`**
Update quickstart with `npx code-search-mcp init`, explain the setup wizard, `.codesearchrc.json`, extension detection, and CLI commands.

- [ ] **Step 2: Update `docs/ARCHITECTURE.md` and `docs/INSTALLATION.md`**
Document the explicit opt-in architecture, dormant MCP server mode, and ignore precedence order.

- [ ] **Step 3: Update `ARTICLE.md`**
Ensure diagrams and examples reflect `code-search init`.

- [ ] **Step 4: Run full test suite & build validation**
Run: `npm test && npm run build`
Expected: All tests pass, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/ARCHITECTURE.md docs/INSTALLATION.md ARTICLE.md
git commit -m "docs: update documentation with init wizard and explicit opt-in architecture"
```
