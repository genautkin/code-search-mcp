import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { detectProjectExtensions } from '../../src/cli/detector.js';

describe('detectProjectExtensions', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codesearch-detect-test-')));
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

  it('respects .gitignore during extension detection when respectGitignore is true', () => {
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'dist/**\n');
    fs.mkdirSync(path.join(tempDir, 'dist'));
    fs.writeFileSync(path.join(tempDir, 'dist', 'bundle.js'), 'var a = 1;');
    fs.writeFileSync(path.join(tempDir, 'main.go'), 'package main');

    const result = detectProjectExtensions(tempDir, { respectGitignore: true });
    expect(result.extensions).toContain('.go');
    expect(result.extensions).not.toContain('.js');
  });

  it('sorts detected extensions by file frequency descending', () => {
    fs.writeFileSync(path.join(tempDir, 'a.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(tempDir, 'b.ts'), 'export const b = 2;');
    fs.writeFileSync(path.join(tempDir, 'c.ts'), 'export const c = 3;');
    fs.writeFileSync(path.join(tempDir, 'readme.md'), '# hello');

    const result = detectProjectExtensions(tempDir);
    expect(result.extensions[0]).toBe('.ts');
    expect(result.counts['.ts']).toBe(3);
    expect(result.counts['.md']).toBe(1);
  });

  it('detects existing candidate ignore directories and excludes non-existent ones', async () => {
    const { detectIgnoreCandidates } = await import('../../src/cli/detector.js');

    // Create some candidate directories
    fs.mkdirSync(path.join(tempDir, '.github', 'skills'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'src', 'locales'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'tests', 'fixtures'), { recursive: true });

    const candidates = detectIgnoreCandidates(tempDir);
    const paths = candidates.map(c => c.path);

    expect(paths).toContain('.github/skills/**');
    expect(paths).toContain('**/locales/**');
    expect(paths).toContain('**/fixtures/**');

    // Shouldn't contain folders that don't exist (e.g. cypress, mocks)
    expect(paths).not.toContain('cypress/**');
    expect(paths).not.toContain('**/mocks/**');
  });
});
