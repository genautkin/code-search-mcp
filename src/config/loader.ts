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

/**
 * If `projectRoot` is inside a Git worktree (where `.git` is a file pointing to
 * `<mainRepo>/.git/worktrees/<name>`), resolves the corresponding directory inside
 * the main repository so untracked `.codesearchrc.json` and `.codesearchignore`
 * files are automatically inherited across all worktrees.
 */
export function resolveMainWorktreeProjectRoot(projectRoot: string): string | null {
  let cur = path.resolve(projectRoot);
  while (true) {
    const dotGit = path.join(cur, '.git');
    if (fs.existsSync(dotGit)) {
      try {
        const stat = fs.statSync(dotGit);
        if (stat.isFile()) {
          const content = fs.readFileSync(dotGit, 'utf8').trim();
          const match = content.match(/^gitdir:\s*(.+)$/i);
          if (match) {
            const gitDir = path.resolve(cur, match[1].trim());
            // Typical worktree gitdir: /path/to/main/.git/worktrees/<worktree-name>
            const normalizedGitDir = gitDir.replace(/\\/g, '/');
            const worktreesMarker = '/.git/worktrees/';
            const markerIdx = normalizedGitDir.lastIndexOf(worktreesMarker);
            if (markerIdx !== -1) {
              const mainRepoRoot = normalizedGitDir.slice(0, markerIdx);
              const relFromWorktreeRoot = path.relative(cur, path.resolve(projectRoot));
              const candidate = path.join(mainRepoRoot, relFromWorktreeRoot);
              if (fs.existsSync(candidate)) {
                return candidate;
              }
            }
          }
        }
      } catch {
        // Ignore errors
      }
      break;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

export function isGlobalPluginDir(dirPath: string): boolean {
  const norm = dirPath.replace(/\\/g, '/');
  return norm.includes('/.gemini/config/plugins/') || norm.includes('/.claude/plugins/');
}

export function isProjectInitialized(projectRoot: string): boolean {
  let canonicalRoot = path.resolve(projectRoot);
  try {
    canonicalRoot = fs.realpathSync(canonicalRoot);
  } catch {
    // fallback
  }

  if (isGlobalPluginDir(canonicalRoot)) {
    return false;
  }

  const rcPath = path.join(canonicalRoot, '.codesearchrc.json');
  const dotFolder = path.join(canonicalRoot, '.code-search');
  const nmCache = path.join(canonicalRoot, 'node_modules', '.cache', 'code-search', 'lancedb');

  if (fs.existsSync(rcPath) || fs.existsSync(dotFolder) || fs.existsSync(nmCache)) {
    return true;
  }

  const mainWorktreeRoot = resolveMainWorktreeProjectRoot(canonicalRoot);
  if (mainWorktreeRoot) {
    if (
      fs.existsSync(path.join(mainWorktreeRoot, '.codesearchrc.json')) ||
      fs.existsSync(path.join(mainWorktreeRoot, '.codesearchignore'))
    ) {
      return true;
    }
  }

  return false;
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

  // List of parent ignore matchers for gitignore in parent directories (subprojects)
  const parentGitignoreMatchers: { relPrefix: string; matcher: Ignore }[] = [];

  // 2. Add .gitignore if exists and respectGitignore is true
  if (respectGitignore) {
    let cur = path.resolve(projectRoot);
    while (true) {
      const candidate = path.join(cur, '.gitignore');
      if (fs.existsSync(candidate)) {
        try {
          const content = fs.readFileSync(candidate, 'utf8');
          if (cur === path.resolve(projectRoot)) {
            ig.add(content);
          } else {
            // @ts-ignore
            const parentIg: Ignore = ignore.default ? ignore.default() : ignore();
            parentIg.add(content);
            const relPrefix = path.relative(cur, projectRoot).replace(/\\/g, '/');
            parentGitignoreMatchers.push({ relPrefix, matcher: parentIg });
          }
        } catch {
          // Ignore read errors
        }
      }

      if (fs.existsSync(path.join(cur, '.git'))) {
        break;
      }
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
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

  // 4. Add .codesearchignore if exists (or inherit from main git worktree)
  const codesearchIgnorePath = path.join(projectRoot, '.codesearchignore');
  if (fs.existsSync(codesearchIgnorePath)) {
    try {
      const content = fs.readFileSync(codesearchIgnorePath, 'utf8');
      ig.add(content);
    } catch {
      // Ignore read errors
    }
  } else {
    const mainWorktreeRoot = resolveMainWorktreeProjectRoot(projectRoot);
    if (mainWorktreeRoot) {
      const mainIgnorePath = path.join(mainWorktreeRoot, '.codesearchignore');
      if (fs.existsSync(mainIgnorePath)) {
        try {
          const content = fs.readFileSync(mainIgnorePath, 'utf8');
          ig.add(content);
        } catch {
          // Ignore read errors
        }
      }
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

      // Check parent gitignore matchers
      for (const { relPrefix, matcher } of parentGitignoreMatchers) {
        const pathFromParent = relPrefix ? `${relPrefix}/${normalized}` : normalized;
        if (matcher.ignores(pathFromParent)) return true;
        if (isDirectory && matcher.ignores(pathFromParent + '/')) return true;
      }

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

  let configPath = path.join(canonicalRoot, '.codesearchrc.json');
  if (!fs.existsSync(configPath)) {
    const mainWorktreeRoot = resolveMainWorktreeProjectRoot(canonicalRoot);
    if (mainWorktreeRoot) {
      const mainRcPath = path.join(mainWorktreeRoot, '.codesearchrc.json');
      if (fs.existsSync(mainRcPath)) {
        configPath = mainRcPath;
      }
    }
  }

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
