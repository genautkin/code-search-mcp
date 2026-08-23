import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scanDirectory } from '../src/indexer/scanner.js';
import { loadConfig } from '../src/config/loader.js';

describe('File Scanner', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-')));
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'node_modules', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'console.log("hello");');
    fs.writeFileSync(path.join(tempDir, 'src', 'app.vue'), '<template><div></div></template>');
    fs.writeFileSync(path.join(tempDir, 'node_modules', 'lib', 'index.js'), 'module.exports = {};');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should discover supported source files and ignore excluded folders', async () => {
    const config = loadConfig(tempDir);
    const existingIndex = new Map();
    const result = await scanDirectory(config, existingIndex);

    expect(result.totalFilesCount).toBe(2);
    const relPaths = result.filesToIndex.map(f => f.relativePath);
    expect(relPaths).toContain('src/index.ts');
    expect(relPaths).toContain('src/app.vue');
    expect(relPaths.some(p => p.includes('node_modules'))).toBe(false);
  });

  it('should detect files that are already indexed and unmodified', async () => {
    const config = loadConfig(tempDir);
    const indexPath = path.join(tempDir, 'src', 'index.ts');
    const stat = fs.statSync(indexPath);

    const existingIndex = new Map<string, { updatedAt: number; contentHash: string }>();
    existingIndex.set('src/index.ts', { updatedAt: stat.mtimeMs + 1000, contentHash: 'some_hash' });

    const result = await scanDirectory(config, existingIndex);
    expect(result.filesToIndex.length).toBe(1); // only app.vue needs indexing
    expect(result.filesToIndex[0].relativePath).toBe('src/app.vue');
    expect(result.unchangedFilesCount).toBe(1);
  });
});
