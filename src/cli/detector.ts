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

export function detectIgnoreCandidates(projectRoot: string): { path: string; label: string; exists: boolean }[] {
  const root = path.resolve(projectRoot);
  const found = new Map<string, { path: string; label: string; exists: boolean }>();

  // 1. Direct path checks at project root
  const directChecks = [
    { pattern: '.github/skills', glob: '.github/skills/**', label: '.github/skills/** (AI agent skills)' },
    { pattern: '.github/instructions', glob: '.github/instructions/**', label: '.github/instructions/** (AI instructions)' },
    { pattern: '.github/prompts', glob: '.github/prompts/**', label: '.github/prompts/** (AI prompts)' },
    { pattern: '.gemini/skills', glob: '.gemini/skills/**', label: '.gemini/skills/** (AI agent skills)' },
    { pattern: '.claude/skills', glob: '.claude/skills/**', label: '.claude/skills/** (AI agent skills)' },
    { pattern: 'cypress', glob: 'cypress/**', label: 'cypress/** (Cypress tests & fixtures)' },
    { pattern: 'docs', glob: 'docs/**', label: 'docs/** (Documentation markdown)' }
  ];

  for (const check of directChecks) {
    if (fs.existsSync(path.join(root, check.pattern))) {
      found.set(check.glob, { path: check.glob, label: check.label, exists: true });
    }
  }

  // 2. Fast shallow scan (depth <= 3) for nested common noisy directories
  const targetDirNames: Record<string, { glob: string; label: string }> = {
    skills: { glob: '**/skills/**', label: '**/skills/** (AI agent skills)' },
    fixtures: { glob: '**/fixtures/**', label: '**/fixtures/** (Test fixtures)' },
    mocks: { glob: '**/mocks/**', label: '**/mocks/** (Mock data & stubs)' },
    __snapshots__: { glob: '**/__snapshots__/**', label: '**/__snapshots__/** (Test snapshots)' },
    e2e: { glob: '**/e2e/**', label: '**/e2e/** (End-to-end test suites)' },
    locales: { glob: '**/locales/**', label: '**/locales/** (Localization dictionaries)' },
    strings: { glob: '**/strings/**', label: '**/strings/** (Localization strings)' },
    i18n: { glob: '**/i18n/**', label: '**/i18n/** (Translation files)' }
  };

  function scanDirs(dir: string, depth: number) {
    if (depth > 3) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const name = entry.name.toLowerCase();
        if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'build' || name === '.code-search') {
          continue;
        }

        if (targetDirNames[name]) {
          const match = targetDirNames[name];
          found.set(match.glob, { path: match.glob, label: match.label, exists: true });
        }

        scanDirs(path.join(dir, entry.name), depth + 1);
      }
    }
  }

  scanDirs(root, 0);

  return Array.from(found.values());
}
