import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig, createIgnoreMatcher } from '../src/config/loader.js';
import { DEFAULT_EXCLUDES } from '../src/config/defaults.js';

describe('Config Loader & Ignore Engine', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'code-search-test-')));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should ignore default patterns (node_modules, dist, binaries, lock files)', () => {
    const matcher = createIgnoreMatcher(tempDir);
    expect(matcher.ignores('node_modules/foo/index.js')).toBe(true);
    expect(matcher.ignores('dist/bundle.js')).toBe(true);
    expect(matcher.ignores('package-lock.json')).toBe(true);
    expect(matcher.ignores('assets/image.png')).toBe(true);
    expect(matcher.ignores('src/index.ts')).toBe(false);
  });

  it('should parse and respect .gitignore in the project root', () => {
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'temp_folder/\n*.secret\n');
    const matcher = createIgnoreMatcher(tempDir);
    expect(matcher.ignores('temp_folder/data.json')).toBe(true);
    expect(matcher.ignores('credentials.secret')).toBe(true);
    expect(matcher.ignores('src/main.ts')).toBe(false);
  });

  it('should parse and respect .codesearchignore', () => {
    fs.writeFileSync(path.join(tempDir, '.codesearchignore'), 'legacy/\n*.generated.ts\n');
    const matcher = createIgnoreMatcher(tempDir);
    expect(matcher.ignores('legacy/old.js')).toBe(true);
    expect(matcher.ignores('src/models/user.generated.ts')).toBe(true);
    expect(matcher.ignores('src/models/user.ts')).toBe(false);
  });

  it('should load custom config from .codesearchrc.json', () => {
    fs.writeFileSync(
      path.join(tempDir, '.codesearchrc.json'),
      JSON.stringify({
        batchSize: 100,
        customExcludes: ['custom_ignore/**']
      })
    );
    const config = loadConfig(tempDir);
    expect(config.batchSize).toBe(100);
    expect(config.customExcludes).toContain('custom_ignore/**');
  });
});
