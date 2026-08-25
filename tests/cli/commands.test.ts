import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runInit } from '../../src/cli/init.js';
import { runStatus } from '../../src/cli/status.js';
import { runSearch } from '../../src/cli/search.js';
import { runIndexCmd } from '../../src/cli/index-cmd.js';

describe('CLI commands suite (status, search, index-cmd)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codesearch-cmds-test-')));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports initialized: false when project has not been initialized', async () => {
    const status = await runStatus(tempDir);
    expect(status.initialized).toBe(false);
  });

  it('reports initialized: true and status details when initialized', async () => {
    fs.writeFileSync(path.join(tempDir, 'hello.ts'), 'export const hello = () => "world";');
    await runInit({
      projectRoot: tempDir,
      yes: true,
      skipIndex: true
    });

    const status = await runStatus(tempDir);
    expect(status.initialized).toBe(true);
    expect(status.config?.projectRoot).toBe(tempDir);
  });

  it('runs index-cmd successfully', async () => {
    fs.writeFileSync(path.join(tempDir, 'math.ts'), 'export function add(a: number, b: number) { return a + b; }');
    await runInit({
      projectRoot: tempDir,
      yes: true,
      skipIndex: true
    });

    const result = await runIndexCmd({
      projectRoot: tempDir,
      forceFull: true
    });

    expect(result.success).toBe(true);
    expect(result.status.indexedFiles).toBeGreaterThanOrEqual(1);
  });
});
