import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runInit } from '../../src/cli/init.js';
import { runUninit } from '../../src/cli/uninit.js';

describe('runInit & runUninit', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codesearch-init-test-')));
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
