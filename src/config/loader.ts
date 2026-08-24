import * as fs from 'fs';
import * as path from 'path';
import ignore, { Ignore } from 'ignore';
import { DEFAULT_EXCLUDES, DEFAULT_EXTENSIONS, DEFAULT_CONFIG } from './defaults.js';
import { CodeSearchConfig } from '../types.js';

export function findProjectRoot(startDir: string = process.cwd()): string {
  let resolved = path.resolve(startDir);
  try {
    resolved = fs.realpathSync(resolved);
  } catch {
    // fallback to resolved path
  }

  let current = resolved;
  while (true) {
    if (
      fs.existsSync(path.join(current, '.git')) ||
      fs.existsSync(path.join(current, '.codesearchrc.json')) ||
      fs.existsSync(path.join(current, 'package.json'))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return resolved;
    }
    current = parent;
  }
}

export function createIgnoreMatcher(projectRoot: string, customExcludes: string[] = []): { ignores: (relPath: string, isDirectory?: boolean) => boolean } {
  // @ts-ignore
  const ig: Ignore = ignore.default ? ignore.default() : ignore();

  // 1. Add default excludes
  ig.add(DEFAULT_EXCLUDES);

  // 2. Add .gitignore if exists
  const gitignorePath = path.join(projectRoot, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      ig.add(content);
    } catch {
      // Ignore read errors
    }
  }

  // 3. Add .ignore if exists
  const ignorePath = path.join(projectRoot, '.ignore');
  if (fs.existsSync(ignorePath)) {
    try {
      const content = fs.readFileSync(ignorePath, 'utf8');
      ig.add(content);
    } catch {
      // Ignore read errors
    }
  }

  // 4. Add .codesearchignore if exists
  const codesearchIgnorePath = path.join(projectRoot, '.codesearchignore');
  if (fs.existsSync(codesearchIgnorePath)) {
    try {
      const content = fs.readFileSync(codesearchIgnorePath, 'utf8');
      ig.add(content);
    } catch {
      // Ignore read errors
    }
  }

  // 5. Add custom excludes from config
  if (customExcludes && customExcludes.length > 0) {
    ig.add(customExcludes);
  }

  return {
    ignores: (relPath: string, isDirectory: boolean = false): boolean => {
      // Normalize slashes for cross-platform matching
      const normalized = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
      if (!normalized || normalized === '.') return false;
      if (ig.ignores(normalized)) return true;
      if (isDirectory && ig.ignores(normalized + '/')) return true;
      return false;
    }
  };
}

export function loadConfig(projectRoot: string): CodeSearchConfig {
  let canonicalRoot = path.resolve(projectRoot);
  try {
    canonicalRoot = fs.realpathSync(canonicalRoot);
  } catch {
    // fallback
  }

  let fileConfig: Partial<CodeSearchConfig> = {};

  const configPath = path.join(canonicalRoot, '.codesearchrc.json');
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      fileConfig = JSON.parse(content);
    } catch (err) {
      console.warn(`[code-search-mcp] Warning: Failed to parse .codesearchrc.json:`, err);
    }
  }

  // Prefer node_modules/.cache/code-search/lancedb if node_modules exists (standard cache directory, zero git noise)
  let dbPath: string;
  const nodeModulesPath = path.join(canonicalRoot, 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    dbPath = path.join(nodeModulesPath, '.cache', 'code-search', 'lancedb');
  } else {
    dbPath = path.join(canonicalRoot, '.code-search', 'lancedb');
  }

  return {
    projectRoot: canonicalRoot,
    dbPath,
    embeddingModel: fileConfig.embeddingModel || DEFAULT_CONFIG.embeddingModel,
    batchSize: fileConfig.batchSize || DEFAULT_CONFIG.batchSize,
    maxFileSizeKb: fileConfig.maxFileSizeKb || DEFAULT_CONFIG.maxFileSizeKb,
    supportedExtensions: fileConfig.supportedExtensions || DEFAULT_EXTENSIONS,
    customExcludes: fileConfig.customExcludes || [],
    queryMultiplier: fileConfig.queryMultiplier || DEFAULT_CONFIG.queryMultiplier,
    searchEf: fileConfig.searchEf || DEFAULT_CONFIG.searchEf
  };
}
