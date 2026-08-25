import chokidar, { FSWatcher } from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import { CodeSearchConfig } from '../types.js';
import { IndexerWorker } from './worker.js';
import { createIgnoreMatcher } from '../config/loader.js';
import { normalizePath } from './chunker.js';

export class FileWatcher {
  private config: CodeSearchConfig;
  private worker: IndexerWorker;
  private watcher: FSWatcher | null = null;
  private debounceMap: Map<string, NodeJS.Timeout> = new Map();
  private supportedExts: Set<string>;
  private matcher: ReturnType<typeof createIgnoreMatcher>;

  constructor(config: CodeSearchConfig, worker: IndexerWorker) {
    this.config = config;
    this.worker = worker;
    this.supportedExts = new Set(config.supportedExtensions.map((e) => e.toLowerCase()));
    this.matcher = createIgnoreMatcher(config.projectRoot, config.customExcludes, config.respectGitignore);
  }

  private readyPromise: Promise<void> | null = null;

  public async start(): Promise<void> {
    if (this.watcher) return;

    this.readyPromise = new Promise((resolve) => {
      this.watcher = chokidar.watch(this.config.projectRoot, {
        ignored: (filePath: string, stats?: any) => {
          const rel = normalizePath(path.relative(this.config.projectRoot, filePath));
          if (!rel || rel === '.') return false;
          const isDir = stats ? (typeof stats.isDirectory === 'function' ? stats.isDirectory() : false) : false;
          return this.matcher.ignores(rel, isDir);
        },
        persistent: true,
        ignoreInitial: true
      });

      this.watcher.on('ready', () => {
        resolve();
      });

      this.watcher.on('error', (err: any) => {
        console.warn('[code-search-mcp] File watcher encountered error:', err?.message || err);
      });

      this.watcher.on('add', (filePath: string) => this.handleFileChange(filePath));
      this.watcher.on('change', (filePath: string) => this.handleFileChange(filePath));
      this.watcher.on('unlink', (filePath: string) => this.handleFileUnlink(filePath));
    });

    await this.readyPromise;
  }

  public async whenReady(): Promise<void> {
    if (this.readyPromise) {
      await this.readyPromise;
    }
  }

  private handleFileChange(filePath: string): void {
    const ext = path.extname(filePath).toLowerCase();
    if (!this.supportedExts.has(ext)) return;

    let absPath = path.resolve(filePath);
    try {
      absPath = fs.realpathSync(absPath);
    } catch {}

    const relPath = normalizePath(path.relative(this.config.projectRoot, absPath));
    if (!relPath || relPath.startsWith('..') || this.matcher.ignores(relPath)) return;

    const existingTimeout = this.debounceMap.get(relPath);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timer = setTimeout(async () => {
      this.debounceMap.delete(relPath);
      try {
        await this.worker.indexSingleFile(relPath, absPath);
      } catch (err) {
        console.warn(`[code-search-mcp] Failed to incrementally index ${relPath}:`, err);
      }
    }, 200);

    this.debounceMap.set(relPath, timer);
  }

  private handleFileUnlink(filePath: string): void {
    let absPath = path.resolve(filePath);
    try {
      absPath = fs.realpathSync(absPath);
    } catch {}

    const relPath = normalizePath(path.relative(this.config.projectRoot, absPath));
    if (!relPath || relPath.startsWith('..')) return;

    const existingTimeout = this.debounceMap.get(relPath);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.debounceMap.delete(relPath);
    }

    this.worker.removeSingleFile(relPath).catch((err) => {
      console.warn(`[code-search-mcp] Failed to remove ${relPath} from index:`, err);
    });
  }

  public async stop(): Promise<void> {
    for (const timer of this.debounceMap.values()) {
      clearTimeout(timer);
    }
    this.debounceMap.clear();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}
