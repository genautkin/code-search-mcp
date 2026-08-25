import * as path from 'path';
import * as fs from 'fs';
import { findProjectRoot, isProjectInitialized, loadConfig } from '../config/loader.js';
import { IndexerWorker } from '../indexer/worker.js';
import { SearchOptions, SearchResult } from '../types.js';

export interface CliSearchOptions extends SearchOptions {
  projectRoot?: string;
}

export async function runSearch(
  query: string,
  options: CliSearchOptions = {}
): Promise<{ results: SearchResult[]; formattedOutput: string }> {
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

  return await worker.query(query, options);
}
