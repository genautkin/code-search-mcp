import * as path from 'path';
import * as fs from 'fs';
import { findProjectRoot, isProjectInitialized, loadConfig } from '../config/loader.js';
import { IndexerWorker } from '../indexer/worker.js';
import { CodeSearchConfig, IndexStatus } from '../types.js';

export interface CliStatusResult {
  initialized: boolean;
  projectRoot: string;
  config?: CodeSearchConfig;
  status?: IndexStatus;
}

export async function runStatus(projectRoot?: string): Promise<CliStatusResult> {
  const targetDir = projectRoot ? path.resolve(projectRoot) : findProjectRoot(process.cwd());
  let canonicalRoot = targetDir;
  try {
    canonicalRoot = fs.realpathSync(targetDir);
  } catch {}

  const initialized = isProjectInitialized(canonicalRoot);
  if (!initialized) {
    return {
      initialized: false,
      projectRoot: canonicalRoot
    };
  }

  const config = loadConfig(canonicalRoot);
  const worker = new IndexerWorker(config);
  await worker.init();
  const status = worker.getStatus();

  return {
    initialized: true,
    projectRoot: canonicalRoot,
    config,
    status
  };
}
