import * as path from 'path';
import * as fs from 'fs';
import { findProjectRoot, isProjectInitialized, loadConfig } from '../config/loader.js';
import { IndexerWorker } from '../indexer/worker.js';
import { IndexStatus } from '../types.js';

export interface RunIndexOptions {
  projectRoot?: string;
  forceFull?: boolean;
}

export async function runIndexCmd(options: RunIndexOptions = {}): Promise<{ success: boolean; status: IndexStatus }> {
  const targetDir = options.projectRoot ? path.resolve(options.projectRoot) : findProjectRoot(process.cwd());
  let canonicalRoot = targetDir;
  try {
    canonicalRoot = fs.realpathSync(targetDir);
  } catch {}

  const initialized = isProjectInitialized(canonicalRoot);
  if (!initialized) {
    throw new Error(`Project is not initialized. Run 'code-search init' first.`);
  }

  const config = loadConfig(canonicalRoot);
  const worker = new IndexerWorker(config);
  await worker.init();

  await worker.startIndexing(Boolean(options.forceFull));
  const status = worker.getStatus();

  return {
    success: true,
    status
  };
}
