import chokidar, { FSWatcher } from 'chokidar';
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
  private matcher: { ignores: (relPath: string) => boolean };

  constructor(config: CodeSearchConfig, worker: IndexerWorker) {
    this.config = config;
    this.worker = worker;
    this.supportedExts = new Set(config.supportedExtensions.map((e) => e.toLowerCase()));
    this.matcher = createIgnoreMatcher(config.projectRoot, config.customExcludes);
  }

  private readyPromise: Promise<void> | null = null;

  public async start(): Promise<void> {
    if (this.watcher) return;

    this.readyPromise = new Promise((resolve) => {
      this.watcher = chokidar.watch(this.config.projectRoot, {
        ignored: (filePath: string) => {
          const rel = normalizePath(path.relative(this.config.projectRoot, filePath));
          if (!rel || rel === '.') return false;
          return this.matcher.ignores(rel);
        },
        persistent: true,
        ignoreInitial: true
      });

      this.watcher.on('ready', () => {
        resolve();
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

    const relPath = normalizePath(path.relative(this.config.projectRoot, filePath));
    if (this.matcher.ignores(relPath)) return;

    const existingTimeout = this.debounceMap.get(relPath);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timer = setTimeout(async () => {
      this.debounceMap.delete(relPath);
      try {
        await this.worker.indexSingleFile(relPath, filePath);
      } catch (err) {
        console.warn(`[code-search-mcp] Failed to incrementally index ${relPath}:`, err);
      }
    }, 200);

    this.debounceMap.set(relPath, timer);
  }

  private handleFileUnlink(filePath: string): void {
    const relPath = normalizePath(path.relative(this.config.projectRoot, filePath));
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
