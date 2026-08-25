import * as fs from 'fs';
import * as path from 'path';
import { ExtensionDetectionResult } from '../types.js';
import { createIgnoreMatcher } from '../config/loader.js';
import { normalizePath } from '../indexer/chunker.js';
import { DEFAULT_EXTENSIONS } from '../config/defaults.js';

const KNOWN_CODE_EXTENSIONS = new Set([
  ...DEFAULT_EXTENSIONS,
  '.html', '.htm', '.xml', '.svg', '.css', '.scss', '.sass', '.less',
  '.json5', '.jsonc', '.env', '.dockerfile', '.makefile',
  '.tf', '.hcl', '.zig', '.nim', '.lua', '.perl', '.pl', '.r', '.ex', '.exs', '.erl', '.clj', '.lisp'
]);

export interface DetectOptions {
  respectGitignore?: boolean;
  maxFilesToSample?: number;
}

export function detectProjectExtensions(
  projectRoot: string,
  options: DetectOptions = {}
): ExtensionDetectionResult {
  const canonicalRoot = path.resolve(projectRoot);
  const respectGitignore = options.respectGitignore ?? true;
  const maxFiles = options.maxFilesToSample ?? 50000;

  const matcher = createIgnoreMatcher(canonicalRoot, [], respectGitignore);
  const counts: Record<string, number> = {};
  let totalFiles = 0;

  function walk(currentDir: string) {
    if (totalFiles >= maxFiles) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (totalFiles >= maxFiles) break;

      const fullPath = path.join(currentDir, entry.name);
      const relPath = normalizePath(path.relative(canonicalRoot, fullPath));
      const isDir = entry.isDirectory();

      if (matcher.ignores(relPath, isDir)) {
        continue;
      }

      if (isDir) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext && KNOWN_CODE_EXTENSIONS.has(ext)) {
          counts[ext] = (counts[ext] || 0) + 1;
          totalFiles++;
        }
      }
    }
  }

  walk(canonicalRoot);

  // Sort extensions by count descending
  const sortedExtensions = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  // If no known extensions found, fall back to default extensions
  const finalExtensions = sortedExtensions.length > 0 ? sortedExtensions : DEFAULT_EXTENSIONS;

  return {
    extensions: finalExtensions,
    counts,
    totalFiles
  };
}
