import * as fs from 'fs';
import * as path from 'path';
import { CodeChunk, CodeSearchConfig, IndexStatus, SearchOptions, SearchResult } from '../types.js';
import { VectorStore } from '../store/lancedb.js';
import { EmbeddingEngine } from '../embeddings/engine.js';
import { scanDirectory } from './scanner.js';
import { chunkCodeFile, formatChunkForEmbedding, normalizePath } from './chunker.js';

import { ProcessLock } from './lock.js';

export class IndexerWorker {
  private config: CodeSearchConfig;
  private store: VectorStore;
  private embeddings: EmbeddingEngine;
  private status: IndexStatus;
  private isRunning: boolean = false;
  private lock: ProcessLock;

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

  public async init(): Promise<void> {
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
  }

  public getStatus(): IndexStatus {
    return { ...this.status };
  }

  public async startIndexing(forceFull = false): Promise<void> {
    if (this.isRunning) {
      return;
    }

    if (!this.lock.acquire()) {
      const count = await this.store.count();
      const stats = await this.store.getIndexedFileStats();
      this.status.indexedChunks = count;
      this.status.indexedFiles = stats.size;
      this.status.totalFiles = stats.size;
      this.status.state = 'ready';
      this.status.progressPercentage = stats.size > 0 ? 100 : 0;
      return;
    }

    this.isRunning = true;

    try {
      this.status.state = 'scanning';
      this.status.error = undefined;

      if (forceFull) {
        await this.store.clear();
      }

      const indexedFilesMap = forceFull ? new Map() : await this.store.getIndexedFileStats();
      const scan = await scanDirectory(this.config, indexedFilesMap);

      // Clean up deleted files
      for (const relPath of scan.filesToDelete) {
        await this.store.deleteByFilePath(relPath);
      }

      this.status.totalFiles = scan.totalFilesCount;
      this.status.indexedFiles = scan.unchangedFilesCount;
      this.status.progressPercentage =
        scan.totalFilesCount === 0 ? 100 : Math.round((scan.unchangedFilesCount / scan.totalFilesCount) * 100);

      if (scan.filesToIndex.length === 0) {
        this.status.state = 'ready';
        this.status.progressPercentage = 100;
        this.status.lastIndexedAt = Date.now();
        this.status.indexedChunks = await this.store.count();
        this.isRunning = false;
        return;
      }

      this.status.state = 'indexing';

      let processedInScan = 0;
      const batchSize = this.config.batchSize;

      for (let i = 0; i < scan.filesToIndex.length; i += batchSize) {
        const batch = scan.filesToIndex.slice(i, i + batchSize);
        const batchChunks: CodeChunk[] = [];
        const batchRelPaths: string[] = [];

        for (const file of batch) {
          this.status.currentFile = file.relativePath;
          batchRelPaths.push(file.relativePath);
          try {
            if (fs.existsSync(file.absolutePath)) {
              const content = fs.readFileSync(file.absolutePath, 'utf8');
              const fileChunks = chunkCodeFile(file.relativePath, file.absolutePath, content);
              batchChunks.push(...fileChunks);
            }
          } catch (fileErr) {
            console.warn(`[code-search-mcp] Failed to read ${file.relativePath}:`, fileErr);
          }
        }

        if (batchChunks.length > 0) {
          // Generate embeddings with contextual breadcrumbs in one vectorized ONNX pass
          const texts = batchChunks.map((c) => formatChunkForEmbedding(c));
          const vectors = await this.embeddings.embedBatch(texts, 64);
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
      }

      this.status.state = 'ready';
      this.status.progressPercentage = 100;
      this.status.lastIndexedAt = Date.now();
      this.status.currentFile = undefined;
      this.status.indexedChunks = await this.store.count();
    } catch (err: any) {
      this.status.state = 'error';
      this.status.error = err?.message || String(err);
      console.error('[code-search-mcp] Indexing worker error:', err);
    } finally {
      this.isRunning = false;
      this.lock.release();
    }
  }

  public async indexSingleFile(relativePath: string, absolutePath?: string): Promise<void> {
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
    const normRelPath = normalizePath(relativePath);
    await this.store.deleteByFilePath(normRelPath);
  }

  public async query(
    queryText: string,
    options?: number | SearchOptions
  ): Promise<{
    status: IndexStatus;
    results: SearchResult[];
    formattedOutput: string;
  }> {
    const opts: SearchOptions = typeof options === 'number' ? { limit: options } : (options || {});
    const queryVector = await this.embeddings.embedText(queryText);
    const results = await this.store.search(queryVector, opts, queryText);
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
