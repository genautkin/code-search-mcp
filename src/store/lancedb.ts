import * as lancedb from '@lancedb/lancedb';
import * as fs from 'fs';
import * as path from 'path';
import { CodeChunk, SearchResult } from '../types.js';

export const TABLE_NAME = 'code_chunks';

export class VectorStore {
  private dbPath: string;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  public async init(): Promise<void> {
    if (!fs.existsSync(this.dbPath)) {
      fs.mkdirSync(this.dbPath, { recursive: true });
    }

    this.db = await lancedb.connect(this.dbPath);
    const tableNames = await this.db.tableNames();

    if (tableNames.includes(TABLE_NAME)) {
      this.table = await this.db.openTable(TABLE_NAME);
    } else {
      // Seed table with dummy schema record and immediately delete it
      const seedRecord = {
        id: '__init__',
        filePath: '__init__',
        absolutePath: '__init__',
        startLine: 0,
        endLine: 0,
        content: '__init__',
        contentHash: '__init__',
        vector: new Array(384).fill(0),
        language: 'text',
        updatedAt: 0
      };
      this.table = await this.db.createTable(TABLE_NAME, [seedRecord]);
      await this.table.delete("id = '__init__'");
    }
  }

  private ensureTable(): lancedb.Table {
    if (!this.table) {
      throw new Error('VectorStore not initialized. Call init() first.');
    }
    return this.table;
  }

  public async insertChunks(chunks: CodeChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    const table = this.ensureTable();

    const records = chunks.map((chunk) => ({
      id: chunk.id,
      filePath: chunk.filePath,
      absolutePath: chunk.absolutePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      content: chunk.content,
      contentHash: chunk.contentHash,
      vector: chunk.vector || new Array(384).fill(0),
      language: chunk.language || 'text',
      updatedAt: chunk.updatedAt || Date.now()
    }));

    await table.add(records);
  }

  public async deleteByFilePath(filePath: string): Promise<void> {
    const table = this.ensureTable();
    // Escape single quotes in file paths
    const escaped = filePath.replace(/'/g, "\\'");
    await table.delete(`\`filePath\` = '${escaped}'`);
  }

  public async search(queryVector: number[], limit: number = 10): Promise<SearchResult[]> {
    const table = this.ensureTable();
    const rowCount = await table.countRows();
    if (rowCount === 0) {
      return [];
    }

    try {
      const records = await table
        .vectorSearch(queryVector)
        .distanceType('cosine')
        .limit(limit)
        .toArray();

      return records.map((record: any) => {
        // Cosine distance d in LanceDB is 1 - cos_sim (so score = 1 - d)
        const distance = typeof record._distance === 'number' ? record._distance : 1.0;
        const score = Math.max(0, Math.min(1, 1 - distance));

        return {
          filePath: record.filePath,
          startLine: record.startLine,
          endLine: record.endLine,
          content: record.content,
          score: Number(score.toFixed(4)),
          language: record.language
        };
      });
    } catch (err) {
      console.error('[code-search-mcp] Error searching LanceDB:', err);
      return [];
    }
  }

  public async count(): Promise<number> {
    const table = this.ensureTable();
    return await table.countRows();
  }

  public async getIndexedFileStats(): Promise<Map<string, { updatedAt: number; contentHash: string }>> {
    const table = this.ensureTable();
    const map = new Map<string, { updatedAt: number; contentHash: string }>();

    const rowCount = await table.countRows();
    if (rowCount === 0) return map;

    try {
      // Query metadata columns
      const records = await table.query().select(['filePath', 'updatedAt', 'contentHash']).toArray();
      for (const rec of records) {
        if (rec.filePath && !map.has(rec.filePath)) {
          map.set(rec.filePath, {
            updatedAt: rec.updatedAt || 0,
            contentHash: rec.contentHash || ''
          });
        }
      }
    } catch (err) {
      console.warn('[code-search-mcp] Warning getting indexed file stats:', err);
    }

    return map;
  }

  public async clear(): Promise<void> {
    const table = this.ensureTable();
    await table.delete('id IS NOT NULL');
  }
}
