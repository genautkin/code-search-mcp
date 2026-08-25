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

const CANDIDATE_IGNORE_DIRS = [
  { path: '.github/skills', label: '.github/skills/** (AI agent skills)' },
  { path: '.github/instructions', label: '.github/instructions/** (AI system instructions)' },
  { path: '.github/prompts', label: '.github/prompts/** (AI prompt templates)' },
  { path: '.gemini/skills', label: '.gemini/skills/** (AI agent skills)' },
  { path: '.claude/skills', label: '.claude/skills/** (AI agent skills)' },
  { path: 'skills', label: 'skills/** (Agent skill definitions)' },
  { path: 'fixtures', label: '**/fixtures/** (Test fixtures)' },
  { path: 'mocks', label: '**/mocks/** (Mock data & stubs)' },
  { path: 'e2e', label: '**/e2e/** (End-to-end test suites)' },
  { path: 'cypress', label: 'cypress/** (Cypress tests & fixtures)' },
  { path: 'locales', label: '**/locales/** (Localization dictionaries)' },
  { path: 'i18n', label: '**/i18n/** (Translation files)' },
  { path: 'docs', label: 'docs/** (Documentation markdown)' }
];

export function detectIgnoreCandidates(projectRoot: string): { path: string; label: string; exists: boolean }[] {
  const root = path.resolve(projectRoot);
  const found: { path: string; label: string; exists: boolean }[] = [];

  for (const candidate of CANDIDATE_IGNORE_DIRS) {
    const fullPath = path.join(root, candidate.path);
    if (fs.existsSync(fullPath)) {
      found.push({ ...candidate, exists: true });
    }
  }

  return found;
}
