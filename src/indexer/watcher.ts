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
  private supportedExts: Set<string>;
  private matcher: ReturnType<typeof createIgnoreMatcher>;

  // Burst and batch queue state
  private pendingUpdates: Map<string, string> = new Map();
  private pendingDeletes: Set<string> = new Set();
  private debounceTimer: NodeJS.Timeout | null = null;
  private firstEventTime: number = 0;
  private isProcessing: boolean = false;

  private readonly debounceMs = 350;
  private readonly maxDebounceMs = 1500;
  private readonly burstThreshold = 15;

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
          if (
            rel.startsWith('node_modules') ||
            rel.startsWith('.git') ||
            rel.startsWith('.code-search') ||
            rel.includes('/node_modules/') ||
            rel.startsWith('dist') ||
            rel.startsWith('build') ||
            rel.startsWith('.cache')
          ) {
            return true;
          }
          const isDir = stats ? (typeof stats.isDirectory === 'function' ? stats.isDirectory() : false) : false;
          return this.matcher.ignores(rel, isDir) || this.matcher.ignores(rel + '/');
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

    this.pendingDeletes.delete(relPath);
    this.pendingUpdates.set(relPath, absPath);
    this.scheduleFlush();
  }

  private handleFileUnlink(filePath: string): void {
    let absPath = path.resolve(filePath);
    try {
      absPath = fs.realpathSync(absPath);
    } catch {}

    const relPath = normalizePath(path.relative(this.config.projectRoot, absPath));
    if (!relPath || relPath.startsWith('..')) return;

    this.pendingUpdates.delete(relPath);
    this.pendingDeletes.add(relPath);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    const now = Date.now();
    if (this.firstEventTime === 0) {
      this.firstEventTime = now;
    }

    const elapsed = now - this.firstEventTime;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const remaining = Math.max(0, this.maxDebounceMs - elapsed);
    const delay = Math.min(this.debounceMs, remaining);

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.firstEventTime = 0;
      void this.flushPending();
    }, delay);
  }

  private async flushPending(): Promise<void> {
    if (this.isProcessing) {
      this.scheduleFlush();
      return;
    }

    const updates = new Map(this.pendingUpdates);
    const deletes = new Set(this.pendingDeletes);
    this.pendingUpdates.clear();
    this.pendingDeletes.clear();

    const totalCount = updates.size + deletes.size;
    if (totalCount === 0) return;

    this.isProcessing = true;

    try {
      if (totalCount > this.burstThreshold) {
        // Coalesce bulk changes (git branch checkout, pull, merge, npm install) into gentle background reindex
        await this.worker.startIndexing({ forceFull: false, mode: 'gentle' });
      } else {
        // Incremental sequential processing for normal interactive edits
        if (deletes.size > 0) {
          await this.worker.removeFiles(Array.from(deletes));
        }

        for (const [relPath, absPath] of updates.entries()) {
          try {
            await this.worker.indexSingleFile(relPath, absPath);
          } catch (err) {
            console.warn(`[code-search-mcp] Failed to incrementally index ${relPath}:`, err);
          }
          // Cooperative yield between files to prevent CPU lockup
          await new Promise((resolve) => setImmediate(resolve));
        }
      }
    } finally {
      this.isProcessing = false;
      if (this.pendingUpdates.size > 0 || this.pendingDeletes.size > 0) {
        this.scheduleFlush();
      }
    }
  }

  public async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.firstEventTime = 0;
    this.pendingUpdates.clear();
    this.pendingDeletes.clear();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}
