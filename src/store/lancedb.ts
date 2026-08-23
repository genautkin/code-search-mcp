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

  private async retryOnConflict<T>(fn: (table: lancedb.Table) => Promise<T>, maxRetries = 5): Promise<T> {
    let attempt = 0;
    while (true) {
      const table = this.ensureTable();
      try {
        return await fn(table);
      } catch (err: any) {
        const msg = String(err?.message || err);
        const isConflict =
          msg.includes('Commit conflict') ||
          msg.includes('conflict') ||
          msg.includes('Version mismatch') ||
          msg.includes('version');

        if (isConflict && attempt < maxRetries) {
          attempt++;
          const delay = 50 * Math.pow(2, attempt) + Math.floor(Math.random() * 50);
          await new Promise((resolve) => setTimeout(resolve, delay));
          if (this.db) {
            try {
              this.table = await this.db.openTable(TABLE_NAME);
            } catch {}
          }
          continue;
        }
        throw err;
      }
    }
  }

  public async insertChunks(chunks: CodeChunk[]): Promise<void> {
    if (chunks.length === 0) return;

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

    await this.retryOnConflict((table) => table.add(records));
  }

  public async deleteByFilePath(filePath: string): Promise<void> {
    const escaped = filePath.replace(/'/g, "\\'");
    await this.retryOnConflict((table) => table.delete(`\`filePath\` = '${escaped}'`));
  }

  public async deleteByFilePaths(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return;
    for (let i = 0; i < filePaths.length; i += 50) {
      const batch = filePaths.slice(i, i + 50);
      const condition = batch
        .map((fp) => `\`filePath\` = '${fp.replace(/'/g, "\\'")}'`)
        .join(' OR ');
      await this.retryOnConflict((table) => table.delete(condition));
    }
  }

  public async searchVector(queryVector: number[], limit: number = 10): Promise<SearchResult[]> {
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

  public async searchLexical(queryText: string, limit: number = 30): Promise<SearchResult[]> {
    const table = this.ensureTable();
    const rowCount = await table.countRows();
    if (rowCount === 0) {
      return [];
    }

    const stopWords = new Set(['the', 'and', 'for', 'with', 'where', 'how', 'what', 'this', 'that', 'from', 'code', 'file']);
    const rawTokens = queryText
      .split(/[\s,;:!?()[\]{}<>"]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !stopWords.has(t.toLowerCase()));

    if (rawTokens.length === 0) {
      return [];
    }

    const tokens = rawTokens.slice(0, 5);
    const filterClauses = tokens.map((token) => {
      const escaped = token.replace(/'/g, "''").replace(/\\/g, '\\\\');
      return `\`content\` LIKE '%${escaped}%' OR \`filePath\` LIKE '%${escaped}%'`;
    });

    try {
      const whereClause = filterClauses.join(' OR ');
      const records = await table.query().where(whereClause).limit(limit).toArray();

      return records
        .map((record: any) => {
          let matchCount = 0;
          const lowerContent = (record.content || '').toLowerCase();
          const lowerPath = (record.filePath || '').toLowerCase();

          for (const token of tokens) {
            const t = token.toLowerCase();
            if (lowerPath.includes(t)) matchCount += 3;
            let pos = 0;
            while ((pos = lowerContent.indexOf(t, pos)) !== -1) {
              matchCount += 1;
              pos += t.length;
              if (matchCount >= 20) break;
            }
          }

          const score = Math.min(1, matchCount * 0.1);
          return {
            filePath: record.filePath,
            startLine: record.startLine,
            endLine: record.endLine,
            content: record.content,
            score: Number(score.toFixed(4)),
            language: record.language
          };
        })
        .sort((a, b) => b.score - a.score);
    } catch (err) {
      console.warn('[code-search-mcp] Lexical search warning:', err);
      return [];
    }
  }

  public async searchHybrid(queryVector: number[], queryText: string, limit: number = 10): Promise<SearchResult[]> {
    const candidateLimit = Math.max(limit * 3, 30);
    const [vectorHits, lexicalHits] = await Promise.all([
      this.searchVector(queryVector, candidateLimit),
      this.searchLexical(queryText, candidateLimit)
    ]);

    if (lexicalHits.length === 0) {
      return vectorHits.slice(0, limit);
    }

    if (vectorHits.length === 0) {
      return lexicalHits.slice(0, limit);
    }

    const rrfMap = new Map<string, { result: SearchResult; rrfScore: number; vectorScore: number }>();
    const RRF_K = 60;

    for (let i = 0; i < vectorHits.length; i++) {
      const hit = vectorHits[i];
      const key = `${hit.filePath}:${hit.startLine}:${hit.endLine}`;
      const rrf = 1.0 / (RRF_K + (i + 1));
      rrfMap.set(key, {
        result: hit,
        rrfScore: rrf,
        vectorScore: hit.score
      });
    }

    for (let j = 0; j < lexicalHits.length; j++) {
      const hit = lexicalHits[j];
      const key = `${hit.filePath}:${hit.startLine}:${hit.endLine}`;
      const rrf = 1.2 / (RRF_K + (j + 1));
      const existing = rrfMap.get(key);
      if (existing) {
        existing.rrfScore += rrf;
      } else {
        rrfMap.set(key, {
          result: hit,
          rrfScore: rrf,
          vectorScore: hit.score * 0.7
        });
      }
    }

    const fused = Array.from(rrfMap.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, limit);

    if (fused.length === 0) return [];

    const maxRrf = fused[0].rrfScore;
    return fused.map(({ result, rrfScore, vectorScore }) => {
      const blendedScore = Math.max(vectorScore, Math.min(0.95, (rrfScore / maxRrf) * 0.85));
      return {
        ...result,
        score: Number(blendedScore.toFixed(4))
      };
    });
  }

  public async search(queryVector: number[], limit: number = 10, queryText?: string): Promise<SearchResult[]> {
    if (queryText) {
      return this.searchHybrid(queryVector, queryText, limit);
    }
    return this.searchVector(queryVector, limit);
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
    if (this.db) {
      try {
        await this.db.dropTable(TABLE_NAME);
      } catch {}
      this.table = null;
      await this.init();
    }
  }
}
