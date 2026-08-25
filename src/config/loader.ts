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

export function isProjectInitialized(projectRoot: string): boolean {
  let canonicalRoot = path.resolve(projectRoot);
  try {
    canonicalRoot = fs.realpathSync(canonicalRoot);
  } catch {
    // fallback
  }
  const rcPath = path.join(canonicalRoot, '.codesearchrc.json');
  const dotFolder = path.join(canonicalRoot, '.code-search');
  const nmCache = path.join(canonicalRoot, 'node_modules', '.cache', 'code-search');

  return fs.existsSync(rcPath) || fs.existsSync(dotFolder) || fs.existsSync(nmCache);
}

export function createIgnoreMatcher(
  projectRoot: string,
  customExcludes: string[] = [],
  respectGitignore: boolean = true
): { ignores: (relPath: string, isDirectory?: boolean) => boolean } {
  // @ts-ignore
  const ig: Ignore = ignore.default ? ignore.default() : ignore();

  // 1. Add default excludes
  ig.add(DEFAULT_EXCLUDES);

  // 2. Add .gitignore if exists and respectGitignore is true
  if (respectGitignore) {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      try {
        const content = fs.readFileSync(gitignorePath, 'utf8');
        ig.add(content);
      } catch {
        // Ignore read errors
      }
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

  interface FileConfigShape extends Partial<CodeSearchConfig> {
    indexPath?: string;
  }

  let fileConfig: FileConfigShape = {};

  const configPath = path.join(canonicalRoot, '.codesearchrc.json');
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      fileConfig = JSON.parse(content);
    } catch (err) {
      console.warn(`[code-search-mcp] Warning: Failed to parse .codesearchrc.json:`, err);
    }
  }

  // Determine database path
  let dbPath: string;
  if (fileConfig.indexPath) {
    dbPath = path.isAbsolute(fileConfig.indexPath)
      ? fileConfig.indexPath
      : path.join(canonicalRoot, fileConfig.indexPath);
  } else {
    const nodeModulesPath = path.join(canonicalRoot, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
      dbPath = path.join(nodeModulesPath, '.cache', 'code-search', 'lancedb');
    } else {
      dbPath = path.join(canonicalRoot, '.code-search', 'lancedb');
    }
  }

  const respectGitignore =
    typeof fileConfig.respectGitignore === 'boolean'
      ? fileConfig.respectGitignore
      : DEFAULT_CONFIG.respectGitignore;

  return {
    projectRoot: canonicalRoot,
    dbPath,
    embeddingModel: fileConfig.embeddingModel || DEFAULT_CONFIG.embeddingModel,
    batchSize: fileConfig.batchSize || DEFAULT_CONFIG.batchSize,
    maxFileSizeKb: fileConfig.maxFileSizeKb || DEFAULT_CONFIG.maxFileSizeKb,
    supportedExtensions: fileConfig.supportedExtensions || DEFAULT_EXTENSIONS,
    customExcludes: fileConfig.customExcludes || [],
    respectGitignore,
    queryMultiplier: fileConfig.queryMultiplier || DEFAULT_CONFIG.queryMultiplier,
    searchEf: fileConfig.searchEf || DEFAULT_CONFIG.searchEf
  };
}
