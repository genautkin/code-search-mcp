import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IndexerWorker } from '../src/indexer/worker.js';
import { FileWatcher } from '../src/indexer/watcher.js';
import { loadConfig } from '../src/config/loader.js';

describe('File Watcher Burst Coalescing', () => {
  let tempDir: string;
  let worker: IndexerWorker;
  let watcher: FileWatcher;

  beforeEach(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-burst-test-')));
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });

    fs.writeFileSync(path.join(tempDir, 'src', 'base.ts'), 'export const base = 1;');

    const config = loadConfig(tempDir);
    worker = new IndexerWorker(config);
    await worker.init();
    await worker.startIndexing();

    watcher = new FileWatcher(config, worker);
    await watcher.start();
  });

  afterEach(async () => {
    await watcher.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('coalesces bursts of >15 file changes into gentle background startIndexing', async () => {
    // Wait for chokidar to be ready
    await new Promise((r) => setTimeout(r, 150));

    // Spy on worker.startIndexing
    const startIndexingSpy = vi.spyOn(worker, 'startIndexing');

    // Create 20 files rapidly (simulating git checkout / merge)
    for (let i = 0; i < 20; i++) {
      fs.writeFileSync(
        path.join(tempDir, 'src', `burst_file_${i}.ts`),
        `export function func_${i}() { return ${i}; }`
      );
    }

    // Wait for debounce and processing
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Should have called startIndexing with gentle mode
    expect(startIndexingSpy).toHaveBeenCalledWith({ forceFull: false, mode: 'gentle' });

    // Verify files were actually indexed and searchable
    const searchRes = await worker.query('func_5', 5);
    expect(searchRes.results.some((r) => r.filePath.includes('burst_file_5.ts'))).toBe(true);
  }, 30000);

  it('processes small batch of deleted files via removeFiles in one batch', async () => {
    await new Promise((r) => setTimeout(r, 150));

    // Create 2 files and wait for them to be indexed
    fs.writeFileSync(path.join(tempDir, 'src', 'to_delete_1.ts'), 'export const del1 = 1;');
    fs.writeFileSync(path.join(tempDir, 'src', 'to_delete_2.ts'), 'export const del2 = 2;');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const removeFilesSpy = vi.spyOn(worker, 'removeFiles');

    // Delete both
    fs.unlinkSync(path.join(tempDir, 'src', 'to_delete_1.ts'));
    fs.unlinkSync(path.join(tempDir, 'src', 'to_delete_2.ts'));

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(removeFilesSpy).toHaveBeenCalled();
  }, 20000);
});
