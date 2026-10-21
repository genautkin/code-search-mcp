import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CodeChunk, CodeSearchConfig, IndexStatus, SearchOptions, SearchResult, StartIndexingOptions } from '../types.js';
import { VectorStore } from '../store/lancedb.js';
import { EmbeddingEngine } from '../embeddings/engine.js';
import { scanDirectory } from './scanner.js';
import { chunkCodeFile, formatChunkForEmbedding, normalizePath } from './chunker.js';
import { loadConfig, resolveMainWorktreeProjectRoot } from '../config/loader.js';
import { logger } from '../logger.js';

import { ProcessLock } from './lock.js';

export class IndexerWorker {
  private config: CodeSearchConfig;
  private store: VectorStore;
  private embeddings: EmbeddingEngine;
  private status: IndexStatus;
  private isRunning: boolean = false;
  private lock: ProcessLock;
  private queuedIndexing: boolean = false;

  constructor(config: CodeSearchConfig) {
    this.config = config;
    this.store = new VectorStore(config.dbPath);
    this.embeddings = EmbeddingEngine.getInstance(config.embeddingModel);
    this.lock = new ProcessLock(config.dbPath);
    this.status = {
      state: 'idle',
      progressPercentage: 0,
      indexedFiles: 0,
      totalFiles: 0,
      indexedChunks: 0
    };
  }

  private isInitialized = false;

  private saveStatusSnapshot(): void {
    try {
      if (!fs.existsSync(this.config.dbPath)) {
        fs.mkdirSync(this.config.dbPath, { recursive: true });
      }
      const statusFilePath = path.join(this.config.dbPath, 'status.json');
      const data = JSON.stringify(
        {
          ...this.status,
          pid: process.pid,
          updatedAt: Date.now()
        },
        null,
        2
      );
      fs.writeFileSync(statusFilePath, data, 'utf8');
    } catch {
      // Non-blocking
    }
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    // Seed from main git worktree's LanceDB index if this worktree has no index yet
    const localTableDir = path.join(this.config.dbPath, 'code_chunks.lance');
    if (!fs.existsSync(localTableDir)) {
      const mainWorktreeRoot = resolveMainWorktreeProjectRoot(this.config.projectRoot);
      if (mainWorktreeRoot) {
        try {
          const mainConfig = loadConfig(mainWorktreeRoot);
          const mainTableDir = path.join(mainConfig.dbPath, 'code_chunks.lance');
          if (fs.existsSync(mainTableDir)) {
            fs.mkdirSync(this.config.dbPath, { recursive: true });
            fs.cpSync(mainTableDir, localTableDir, { recursive: true });
            logger.info('Seeded worktree LanceDB index from main repository', {
              from: mainTableDir,
              to: localTableDir
            });
          }
        } catch {
          // Non-blocking fallback to normal indexing if copy fails
        }
      }
    }

    await this.store.init();
    const count = await this.store.count();
    const stats = await this.store.getIndexedFileStats();
    this.status.indexedChunks = count;
    this.status.indexedFiles = stats.size;
    this.status.totalFiles = stats.size;
    if (stats.size > 0) {
      this.status.state = 'ready';
      this.status.progressPercentage = 100;
    }
    this.isInitialized = true;
    this.saveStatusSnapshot();
  }

  public getStatus(): IndexStatus {
    return { ...this.status };
  }

  public async startIndexing(
    optionsOrForceFull: boolean | StartIndexingOptions = false,
    onProgress?: (status: IndexStatus) => void
  ): Promise<void> {
    const options: StartIndexingOptions =
      typeof optionsOrForceFull === 'boolean'
        ? { forceFull: optionsOrForceFull, mode: 'gentle' }
        : { mode: 'gentle', ...optionsOrForceFull };

    const forceFull = Boolean(options.forceFull);
    const mode = options.mode || 'gentle';
    const batchDelayMs = options.batchDelayMs !== undefined
      ? options.batchDelayMs
      : (mode === 'gentle' ? 50 : 0);
    if (!this.isInitialized) {
      await this.init();
    }

    if (this.isRunning) {
      this.queuedIndexing = true;
      return;
    }

    if (!this.lock.acquire()) {
      const statusFile = path.join(this.config.dbPath, 'status.json');
      if (fs.existsSync(statusFile)) {
        try {
          const raw = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
          this.status = {
            state: raw.state || 'indexing',
            progressPercentage: raw.progressPercentage ?? 0,
            indexedFiles: raw.indexedFiles ?? 0,
            totalFiles: raw.totalFiles ?? 0,
            indexedChunks: raw.indexedChunks ?? 0,
            currentFile: raw.currentFile,
            lastIndexedAt: raw.lastIndexedAt,
            error: raw.error
          };
          onProgress?.({ ...this.status });
          return;
        } catch {}
      }

      const count = await this.store.count();
      const stats = await this.store.getIndexedFileStats();
      this.status.indexedChunks = count;
      this.status.indexedFiles = stats.size;
      this.status.totalFiles = stats.size;
      this.status.state = 'ready';
      this.status.progressPercentage = stats.size > 0 ? 100 : 0;
      onProgress?.({ ...this.status });
      return;
    }

    this.isRunning = true;
    const indexingStartTime = Date.now();
    let prevPriority: number | null = null;
    if (mode === 'gentle') {
      try {
        prevPriority = os.getPriority(process.pid);
        os.setPriority(process.pid, 10);
      } catch {
        // Ignore priority errors on unsupported platforms
      }
    }

    try {
      this.status.state = 'scanning';
      this.status.error = undefined;
      this.saveStatusSnapshot();
      onProgress?.({ ...this.status });

      if (forceFull) {
        await this.store.clear();
      }

      const indexedFilesMap = forceFull ? new Map() : await this.store.getIndexedFileStats();
      const scan = await scanDirectory(this.config, indexedFilesMap);

      // Clean up deleted files in bulk
      if (scan.filesToDelete.length > 0) {
        await this.store.deleteByFilePaths(scan.filesToDelete);
      }

      this.status.totalFiles = scan.totalFilesCount;
      this.status.indexedFiles = scan.unchangedFilesCount;
      this.status.progressPercentage =
        scan.totalFilesCount === 0 ? 100 : Math.round((scan.unchangedFilesCount / scan.totalFilesCount) * 100);
      this.saveStatusSnapshot();
      onProgress?.({ ...this.status });

      if (scan.filesToIndex.length === 0) {
        this.status.state = 'ready';
        this.status.progressPercentage = 100;
        this.status.lastIndexedAt = Date.now();
        this.status.indexedChunks = await this.store.count();
        this.isRunning = false;
        this.saveStatusSnapshot();
        onProgress?.({ ...this.status });
        return;
      }

      logger.info('Indexing started', {
        mode,
        forceFull,
        totalFiles: scan.totalFilesCount,
        filesToIndex: scan.filesToIndex.length,
        unchangedFiles: scan.unchangedFilesCount,
        deletedFiles: scan.filesToDelete.length
      });

      this.status.state = 'indexing';
      this.saveStatusSnapshot();
      onProgress?.({ ...this.status });

      let processedInScan = 0;
      let skippedByContentHash = 0;
      // In gentle mode, use smaller file batches (max 8) to prevent CPU spikes and event loop starvation
      const batchSize = Math.min(this.config.batchSize, mode === 'gentle' ? 8 : this.config.batchSize);
      const onnxMicroBatchSize = mode === 'gentle' ? 8 : 16;
      const onnxInterSliceDelayMs =
        options.batchDelayMs !== undefined ? Math.min(options.batchDelayMs, 25) : (mode === 'gentle' ? 35 : 0);

      for (let i = 0; i < scan.filesToIndex.length; i += batchSize) {
        const batchStartMs = Date.now();
        const batch = scan.filesToIndex.slice(i, i + batchSize);
        const batchChunks: CodeChunk[] = [];
        const batchRelPaths: string[] = [];

        for (const file of batch) {
          this.status.currentFile = file.relativePath;
          try {
            if (fs.existsSync(file.absolutePath)) {
              const content = fs.readFileSync(file.absolutePath, 'utf8');
              const fileChunks = chunkCodeFile(file.relativePath, file.absolutePath, content);

              // Content-hash deduplication: if file mtime changed (e.g. git checkout / worktree switch)
              // but all chunk hashes match what is already stored in LanceDB, skip ONNX & DB writes
              const prevStats = indexedFilesMap.get(file.relativePath);
              if (
                prevStats &&
                prevStats.chunkHashes &&
                prevStats.chunkCount === fileChunks.length &&
                fileChunks.length > 0 &&
                fileChunks.every((c) => prevStats.chunkHashes.has(c.contentHash))
              ) {
                skippedByContentHash++;
                continue;
              }

              batchRelPaths.push(file.relativePath);
              batchChunks.push(...fileChunks);
            } else {
              batchRelPaths.push(file.relativePath);
            }
          } catch (fileErr) {
            console.warn(`[code-search-mcp] Failed to read ${file.relativePath}:`, fileErr);
          }
        }

        if (batchChunks.length > 0) {
          // Generate embeddings with contextual breadcrumbs in length-sorted ONNX micro-batches
          const texts = batchChunks.map((c) => formatChunkForEmbedding(c));
          const vectors = await this.embeddings.embedBatch(texts, onnxMicroBatchSize, onnxInterSliceDelayMs);
          for (let j = 0; j < batchChunks.length; j++) {
            batchChunks[j].vector = vectors[j];
          }

          // Single bulk write transaction for the entire batch
          await this.store.deleteByFilePaths(batchRelPaths);
          await this.store.insertChunks(batchChunks);
        } else if (batchRelPaths.length > 0) {
          await this.store.deleteByFilePaths(batchRelPaths);
        }

        processedInScan += batch.length;
        this.status.indexedFiles = Math.min(scan.totalFilesCount, scan.unchangedFilesCount + processedInScan);
        this.status.progressPercentage = Math.round(
          (this.status.indexedFiles / scan.totalFilesCount) * 100
        );
        this.saveStatusSnapshot();
        onProgress?.({ ...this.status });

        // Cooperative event loop yield to keep server responsive
        await new Promise((resolve) => setImmediate(resolve));
        if (i + batchSize < scan.filesToIndex.length && batchChunks.length > 0) {
          const batchElapsedMs = Date.now() - batchStartMs;
          const effectiveDelayMs =
            options.batchDelayMs !== undefined
              ? options.batchDelayMs
              : mode === 'gentle'
                ? Math.min(1200, Math.max(150, Math.round(batchElapsedMs * 0.6)))
                : 0;
          if (effectiveDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, effectiveDelayMs));
          }
        }
      }

      this.status.state = 'ready';
      this.status.progressPercentage = 100;
      this.status.lastIndexedAt = Date.now();
      this.status.currentFile = undefined;
      this.status.indexedChunks = await this.store.count();
      if (this.status.indexedChunks >= 256) {
        await this.store.createVectorIndex().catch(() => {});
      }
      this.saveStatusSnapshot();
      onProgress?.({ ...this.status });
      logger.info('Indexing completed', {
        mode,
        indexedFiles: this.status.indexedFiles,
        indexedChunks: this.status.indexedChunks,
        skippedByContentHash,
        durationMs: Date.now() - indexingStartTime
      });
    } catch (err: any) {
      this.status.state = 'error';
      this.status.error = err?.message || String(err);
      logger.error('Indexing worker error', { error: this.status.error });
      console.error('[code-search-mcp] Indexing worker error:', err);
      this.saveStatusSnapshot();
      onProgress?.({ ...this.status });
    } finally {
      if (prevPriority !== null) {
        try {
          os.setPriority(process.pid, prevPriority);
        } catch {}
      }
      this.isRunning = false;
      this.lock.release();
      this.saveStatusSnapshot();
      if (this.queuedIndexing) {
        this.queuedIndexing = false;
        void this.startIndexing({ forceFull: false, mode: 'gentle' });
      }
    }
  }

  public async indexSingleFile(relativePath: string, absolutePath?: string): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }
    const absPath = absolutePath || path.join(this.config.projectRoot, relativePath);
    const normRelPath = normalizePath(relativePath);

    if (!fs.existsSync(absPath)) {
      await this.store.deleteByFilePath(normRelPath);
      return;
    }

    const content = fs.readFileSync(absPath, 'utf8');
    const chunks = chunkCodeFile(normRelPath, absPath, content);

    if (chunks.length === 0) {
      await this.store.deleteByFilePath(normRelPath);
      return;
    }

    // Generate embeddings with contextual breadcrumbs
    const texts = chunks.map((c) => formatChunkForEmbedding(c));
    const vectors = await this.embeddings.embedBatch(texts);

    for (let i = 0; i < chunks.length; i++) {
      chunks[i].vector = vectors[i];
    }

    // Delete existing chunks for this file, then insert new ones
    await this.store.deleteByFilePath(normRelPath);
    await this.store.insertChunks(chunks);
  }

  public async removeSingleFile(relativePath: string): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }
    const normRelPath = normalizePath(relativePath);
    await this.store.deleteByFilePath(normRelPath);
  }

  public async removeFiles(relativePaths: string[]): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }
    if (relativePaths.length === 0) return;
    const normPaths = relativePaths.map((p) => normalizePath(p));
    await this.store.deleteByFilePaths(normPaths);
  }

  public async query(
    queryText: string,
    options?: number | SearchOptions
  ): Promise<{
    status: IndexStatus;
    results: SearchResult[];
    formattedOutput: string;
  }> {
    if (!this.isInitialized) {
      await this.init();
    }
    const opts: SearchOptions = typeof options === 'number' ? { limit: options } : (options || {});

    // Strict 5-second search timeout guarantee with instantaneous lexical fallback
    const SEARCH_TIMEOUT_MS = 5000;

    const executeSearch = async (): Promise<SearchResult[]> => {
      const queryVector = await this.embeddings.embedText(queryText);
      return await this.store.search(queryVector, opts, queryText);
    };

    const timeoutFallback = new Promise<SearchResult[]>((resolve) => {
      const timer = setTimeout(async () => {
        try {
          const lexicalOnly = await this.store.searchLexical(queryText, opts.limit || 10);
          resolve(lexicalOnly);
        } catch {
          resolve([]);
        }
      }, SEARCH_TIMEOUT_MS);
      timer.unref?.();
    });

    const results = await Promise.race([executeSearch(), timeoutFallback]);
    const status = this.getStatus();

    let output = '';

    if (status.state !== 'ready') {
      output += `⚠️ [Index status: ${status.state.toUpperCase()} (${status.progressPercentage}% complete - ${status.indexedFiles}/${status.totalFiles} files indexed)]\n`;
      output += `Results from currently indexed files:\n\n`;
    }

    if (results.length === 0) {
      output += `No matching code snippets found for query: "${queryText}".`;
    } else {
      results.forEach((res, idx) => {
        output += `### Match ${idx + 1}: ${res.filePath}:${res.startLine}-${res.endLine} [Score: ${(res.score * 100).toFixed(1)}% | ${res.language || 'text'}]\n`;
        output += '```' + (res.language || '') + '\n';
        
        const lines = res.content.split('\n');
        const numberedContent = lines
          .map((line, lineIdx) => `${res.startLine + lineIdx}: ${line}`)
          .join('\n');

        output += numberedContent + '\n';
        output += '```\n\n';
      });
    }

    return {
      status,
      results,
      formattedOutput: output.trim()
    };
  }
}
