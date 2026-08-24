import * as fs from 'fs';
import * as path from 'path';
import { CodeSearchConfig, ScanResult, ScannedFile } from '../types.js';
import { createIgnoreMatcher } from '../config/loader.js';
import { normalizePath } from './chunker.js';

export async function scanDirectory(
  config: CodeSearchConfig,
  indexedFilesMap: Map<string, { updatedAt: number; contentHash: string }> = new Map()
): Promise<ScanResult> {
  const matcher = createIgnoreMatcher(config.projectRoot, config.customExcludes);
  const maxSizeBytes = config.maxFileSizeKb * 1024;
  const supportedExtSet = new Set(config.supportedExtensions.map((e) => e.toLowerCase()));

  const filesToIndex: ScannedFile[] = [];
  const discoveredRelPaths = new Set<string>();
  let unchangedFilesCount = 0;

  function walk(currentDir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = normalizePath(path.relative(config.projectRoot, fullPath));
      const isDir = entry.isDirectory();

      if (matcher.ignores(relPath, isDir)) {
        continue;
      }

      if (isDir) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!supportedExtSet.has(ext)) {
          continue;
        }

        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > maxSizeBytes || stat.size === 0) {
            continue;
          }

          discoveredRelPaths.add(relPath);

          const existing = indexedFilesMap.get(relPath);
          if (existing && existing.updatedAt >= stat.mtimeMs) {
            unchangedFilesCount++;
          } else {
            filesToIndex.push({
              relativePath: relPath,
              absolutePath: fullPath,
              mtimeMs: stat.mtimeMs,
              sizeBytes: stat.size
            });
          }
        } catch {
          // Skip inaccessible files
        }
      }
    }
  }

  walk(config.projectRoot);

  // Determine deleted files
  const filesToDelete: string[] = [];
  for (const indexedRelPath of indexedFilesMap.keys()) {
    if (!discoveredRelPaths.has(indexedRelPath)) {
      filesToDelete.push(indexedRelPath);
    }
  }

  return {
    filesToIndex,
    filesToDelete,
    unchangedFilesCount,
    totalFilesCount: discoveredRelPaths.size
  };
}
