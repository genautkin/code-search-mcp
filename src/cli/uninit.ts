import * as fs from 'fs';
import * as path from 'path';
import { findProjectRoot, loadConfig } from '../config/loader.js';

export async function runUninit(projectRoot?: string): Promise<{ success: boolean; removedPaths: string[] }> {
  const targetDir = projectRoot ? path.resolve(projectRoot) : findProjectRoot(process.cwd());
  let canonicalRoot = targetDir;
  try {
    canonicalRoot = fs.realpathSync(targetDir);
  } catch {}

  const removedPaths: string[] = [];

  // Load config to know dbPath before removing rc file
  let dbPath: string | undefined;
  try {
    const config = loadConfig(canonicalRoot);
    dbPath = config.dbPath;
  } catch {}

  // 1. Remove .codesearchrc.json
  const rcPath = path.join(canonicalRoot, '.codesearchrc.json');
  if (fs.existsSync(rcPath)) {
    try {
      fs.unlinkSync(rcPath);
      removedPaths.push(rcPath);
    } catch {}
  }

  // 2. Remove .codesearchignore
  const ignorePath = path.join(canonicalRoot, '.codesearchignore');
  if (fs.existsSync(ignorePath)) {
    try {
      fs.unlinkSync(ignorePath);
      removedPaths.push(ignorePath);
    } catch {}
  }

  // 3. Remove index folder / .code-search
  const dotFolder = path.join(canonicalRoot, '.code-search');
  if (fs.existsSync(dotFolder)) {
    try {
      fs.rmSync(dotFolder, { recursive: true, force: true });
      removedPaths.push(dotFolder);
    } catch {}
  }

  if (dbPath && fs.existsSync(dbPath) && !dbPath.includes('.code-search')) {
    try {
      fs.rmSync(dbPath, { recursive: true, force: true });
      removedPaths.push(dbPath);
    } catch {}
  }

  return {
    success: true,
    removedPaths
  };
}
