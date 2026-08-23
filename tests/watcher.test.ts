import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IndexerWorker } from '../src/indexer/worker.js';
import { FileWatcher } from '../src/indexer/watcher.js';
import { loadConfig } from '../src/config/loader.js';

describe('File Watcher Incremental Indexing', () => {
  let tempDir: string;
  let worker: IndexerWorker;
  let watcher: FileWatcher;

  beforeEach(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-test-')));
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });

    fs.writeFileSync(path.join(tempDir, 'src', 'calc.ts'), 'export function add(a, b) { return a + b; }');

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

  it('should auto-index a newly created file after a short delay', async () => {
    // Write new file
    fs.writeFileSync(
      path.join(tempDir, 'src', 'metrics.ts'),
      'export function calculateAnalyticsMetrics() { return { views: 100 }; }'
    );

    // Poll until chokidar and embedding complete (up to 8s)
    let found = false;
    const start = Date.now();
    while (Date.now() - start < 8000) {
      const res = await worker.query('analytics views metric calculation', 5);
      if (res.results.some((r) => r.filePath === 'src/metrics.ts')) {
        found = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    expect(found).toBe(true);
  }, 30000);
});
