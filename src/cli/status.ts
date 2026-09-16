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

  // Check if lock file exists and an indexing process is alive
  const lockFile = path.join(config.dbPath, '.indexer.lock');
  let isLockActive = false;
  if (fs.existsSync(lockFile)) {
    try {
      const pidStr = fs.readFileSync(lockFile, 'utf8').trim();
      const pid = parseInt(pidStr, 10);
      if (!isNaN(pid) && pid !== process.pid) {
        try {
          process.kill(pid, 0);
          isLockActive = true;
        } catch {}
      }
    } catch {}
  }

  // Check if status.json exists for instantaneous non-blocking status
  const statusFile = path.join(config.dbPath, 'status.json');
  if (fs.existsSync(statusFile)) {
    try {
      const statusData = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      if (isLockActive || (statusData.state === 'ready' && statusData.indexedChunks > 0)) {
        return {
          initialized: true,
          projectRoot: canonicalRoot,
          config,
          status: {
            state: isLockActive && statusData.state !== 'indexing' ? 'indexing' : statusData.state,
            progressPercentage: statusData.progressPercentage ?? 100,
            indexedFiles: statusData.indexedFiles ?? 0,
            totalFiles: statusData.totalFiles ?? 0,
            indexedChunks: statusData.indexedChunks ?? 0,
            currentFile: statusData.currentFile,
            lastIndexedAt: statusData.lastIndexedAt,
            error: statusData.error
          }
        };
      }
    } catch {}
  }

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
