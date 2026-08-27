import * as path from 'path';
import * as fs from 'fs';
import { findProjectRoot, isProjectInitialized, loadConfig } from '../config/loader.js';
import { IndexerWorker } from '../indexer/worker.js';
import { CodeSearchConfig, IndexStatus } from '../types.js';

export interface RunIndexOptions {
  projectRoot?: string;
  forceFull?: boolean;
  mode?: 'fast' | 'gentle';
  onProgress?: (status: IndexStatus) => void;
}

export async function runIndexCmd(options: RunIndexOptions = {}): Promise<{
  success: boolean;
  status: IndexStatus;
  config: CodeSearchConfig;
}> {
  const targetDir = options.projectRoot ? path.resolve(options.projectRoot) : findProjectRoot(process.cwd());
  let canonicalRoot = targetDir;
  try {
    canonicalRoot = fs.realpathSync(targetDir);
  } catch {}

  const initialized = isProjectInitialized(canonicalRoot);
  if (!initialized) {
    throw new Error(`Project at ${canonicalRoot} is not initialized. Run 'code-search-mcp init' first.`);
  }

  const config = loadConfig(canonicalRoot);
  const worker = new IndexerWorker(config);
  await worker.init();

  await worker.startIndexing(
    {
      forceFull: Boolean(options.forceFull),
      mode: options.mode || 'fast'
    },
    options.onProgress
  );
  const status = worker.getStatus();

  return {
    success: true,
    status,
    config
  };
}
