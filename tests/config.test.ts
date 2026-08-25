import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig, createIgnoreMatcher, isProjectInitialized } from '../src/config/loader.js';
import { DEFAULT_EXCLUDES } from '../src/config/defaults.js';

describe('Config Loader & Ignore Engine', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'code-search-test-')));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should ignore internal metadata (.git, .code-search)', () => {
    const matcher = createIgnoreMatcher(tempDir);
    expect(matcher.ignores('.git/config')).toBe(true);
    expect(matcher.ignores('.code-search/lancedb/data')).toBe(true);
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

  it('should detect if project is initialized', () => {
    expect(isProjectInitialized(tempDir)).toBe(false);

    fs.writeFileSync(path.join(tempDir, '.codesearchrc.json'), JSON.stringify({ version: 1 }));
    expect(isProjectInitialized(tempDir)).toBe(true);

    fs.unlinkSync(path.join(tempDir, '.codesearchrc.json'));
    expect(isProjectInitialized(tempDir)).toBe(false);

    fs.mkdirSync(path.join(tempDir, '.code-search'));
    expect(isProjectInitialized(tempDir)).toBe(true);
  });

  it('should honor respectGitignore flag', () => {
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'ignored_folder/\n');
    const matcherWithGit = createIgnoreMatcher(tempDir, [], true);
    const matcherWithoutGit = createIgnoreMatcher(tempDir, [], false);

    expect(matcherWithGit.ignores('ignored_folder/file.ts')).toBe(true);
    expect(matcherWithoutGit.ignores('ignored_folder/file.ts')).toBe(false);
  });

  it('should support custom indexPath in .codesearchrc.json', () => {
    fs.writeFileSync(
      path.join(tempDir, '.codesearchrc.json'),
      JSON.stringify({
        indexPath: '.my-search-db'
      })
    );
    const config = loadConfig(tempDir);
    expect(config.dbPath).toBe(path.join(tempDir, '.my-search-db'));
  });
});

