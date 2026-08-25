import * as lancedb from '@lancedb/lancedb';
import * as fs from 'fs';
import * as path from 'path';
import { CodeChunk, SearchOptions, SearchResult } from '../types.js';
import { QueryEnhancer } from '../indexer/query-enhancer.js';

export const TABLE_NAME = 'code_chunks';

export class VectorStore {
  private dbPath: string;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  public queryEnhancer: QueryEnhancer = new QueryEnhancer();

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
      try {
        const rows = await this.table.query().select(['filePath']).limit(5000).toArray();
        for (const row of rows) {
          if (row.filePath) this.queryEnhancer.addWords(row.filePath);
        }
      } catch {
        // non-blocking
      }
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

    for (const chunk of chunks) {
      if (chunk.content) this.queryEnhancer.addWords(chunk.content);
      if (chunk.filePath) this.queryEnhancer.addWords(chunk.filePath);
    }

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

  public async createVectorIndex(): Promise<void> {
    const table = this.ensureTable();
    const rowCount = await table.countRows();
    if (rowCount < 256) return;
    try {
      await table.createIndex('vector', { replace: true });
    } catch (err) {
      // In small datasets or on error, fallback to flat vector scan
      console.warn('[code-search-mcp] Notice: Could not build IVF-PQ vector index:', err);
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

    const stopWords = new Set([
      'the', 'and', 'for', 'with', 'where', 'how', 'what', 'this', 'that', 'from',
      'code', 'file', 'find', 'search', 'get', 'show', 'when', 'which', 'about', 'into'
    ]);

    const rawTokens = queryText
      .split(/[\s,;:!?()[\]{}<>"'`]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !stopWords.has(t.toLowerCase()));

    if (rawTokens.length === 0) {
      return [];
    }

    // Enhance tokens with Stemming and Typo correction
    const enhanced = this.queryEnhancer.enhanceTokens(rawTokens);
    const candidateTokens = new Set<string>([...rawTokens, ...enhanced.tokens, ...enhanced.stemmed]);

    const tokenSet = new Set<string>();
    for (const token of candidateTokens) {
      tokenSet.add(token);

      // Split CamelCase or PascalCase (e.g. MarginReductionCfdEngine -> Margin, Reduction, Cfd, Engine)
      const camelParts = token.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
      if (camelParts.length > 1) {
        for (const part of camelParts) {
          if (part.length >= 2 && !stopWords.has(part.toLowerCase())) {
            tokenSet.add(part);
          }
        }
      }

      // Split snake_case or kebab-case
      const subParts = token.split(/[-_.]+/);
      if (subParts.length > 1) {
        for (const part of subParts) {
          if (part.length >= 2 && !stopWords.has(part.toLowerCase())) {
            tokenSet.add(part);
          }
        }
      }
    }

    // Fast path-matching query in LanceDB (scans short filePath strings only, < 5ms)
    const primaryTokens = Array.from(new Set([...rawTokens, ...enhanced.tokens])).slice(0, 5);
    const searchTokens = Array.from(tokenSet).slice(0, 8);
    const pathClauses = searchTokens.map((token) => {
      const escaped = token.replace(/'/g, "''").replace(/\\/g, '\\\\').toLowerCase();
      return `LOWER(\`filePath\`) LIKE '%${escaped}%'`;
    });

    const isJsonQuery = queryText.toLowerCase().includes('json');

    try {
      const whereClause = pathClauses.join(' OR ');
      const records = await table.query().where(whereClause).limit(limit * 2).toArray();

      return records
        .map((record: any) => {
          let matchCount = 0;
          const lowerContent = (record.content || '').toLowerCase();
          const lowerPath = (record.filePath || '').toLowerCase();
          const rawContent = record.content || '';

          // 1. Primary / Exact Token Matches (High Weight)
          for (const token of primaryTokens) {
            const tLower = token.toLowerCase();
            if (lowerPath.includes(tLower)) matchCount += 10;
            if (rawContent.includes(token)) matchCount += 8; // Exact case match
            else if (lowerContent.includes(tLower)) matchCount += 4;
          }

          // 2. Sub-part Token Matches (Low Weight for disambiguation)
          for (const token of tokenSet) {
            if (primaryTokens.includes(token)) continue;
            const tLower = token.toLowerCase();
            if (lowerPath.includes(tLower)) matchCount += 2;
            if (lowerContent.includes(tLower)) matchCount += 1;
          }

          let score = Math.min(0.85, matchCount * 0.05);
          if (!isJsonQuery && (record.filePath?.endsWith('.json') || record.language === 'json')) {
            score *= 0.5;
          }

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
    const candidateLimit = Math.max(limit * 4, 40);
    const [vectorHits, lexicalHits] = await Promise.all([
      this.searchVector(queryVector, candidateLimit),
      this.searchLexical(queryText, candidateLimit)
    ]);

    if (vectorHits.length === 0) {
      return lexicalHits.slice(0, limit);
    }

    const isJsonQuery = queryText.toLowerCase().includes('json');
    const stopWords = new Set([
      'the', 'and', 'for', 'with', 'where', 'how', 'what', 'this', 'that', 'from',
      'code', 'file', 'find', 'search', 'get', 'show', 'when', 'which', 'about', 'into'
    ]);
    const queryTokens = queryText
      .split(/[\s,;:!?()[\]{}<>"'`]+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length >= 2 && !stopWords.has(t));

    // Combine vector hits with fast in-memory keyword re-ranking
    const combinedMap = new Map<string, { result: SearchResult; finalScore: number }>();

    for (const hit of vectorHits) {
      const key = `${hit.filePath}:${hit.startLine}:${hit.endLine}`;
      const lowerContent = (hit.content || '').toLowerCase();
      const lowerPath = hit.filePath.toLowerCase();
      let matchedTokens = 0;

      for (const token of queryTokens) {
        if (lowerPath.includes(token) || lowerContent.includes(token)) {
          matchedTokens++;
        }
      }

      const matchRatio = queryTokens.length > 0 ? matchedTokens / queryTokens.length : 0;
      let finalScore = hit.score * 0.6 + matchRatio * 0.4;

      if (!isJsonQuery && (hit.filePath.endsWith('.json') || hit.language === 'json')) {
        finalScore *= 0.6;
      }

      combinedMap.set(key, {
        result: {
          ...hit,
          score: Number(finalScore.toFixed(4))
        },
        finalScore
      });
    }

    // Merge in pure lexical hits
    for (const lex of lexicalHits) {
      const key = `${lex.filePath}:${lex.startLine}:${lex.endLine}`;
      const existing = combinedMap.get(key);
      if (existing) {
        existing.finalScore = Math.min(1.0, existing.finalScore + lex.score * 0.3);
        existing.result.score = Number(existing.finalScore.toFixed(4));
      } else {
        combinedMap.set(key, {
          result: lex,
          finalScore: lex.score
        });
      }
    }

    return Array.from(combinedMap.values())
      .sort((a, b) => b.finalScore - a.finalScore)
      .map((item) => item.result)
      .slice(0, limit);
  }

  private normalizeLanguage(lang: string): string {
    const l = lang.toLowerCase().trim().replace(/^\./, '');
    switch (l) {
      case 'ts':
      case 'tsx':
      case 'typescript':
        return 'typescript';
      case 'js':
      case 'jsx':
      case 'javascript':
      case 'mjs':
      case 'cjs':
        return 'javascript';
      case 'vue':
        return 'vue';
      case 'svelte':
        return 'svelte';
      case 'cs':
      case 'c#':
      case 'csharp':
        return 'csharp';
      case 'py':
      case 'python':
        return 'python';
      case 'md':
      case 'markdown':
      case 'mdx':
        return 'markdown';
      case 'golang':
      case 'go':
        return 'go';
      case 'rs':
      case 'rust':
        return 'rust';
      case 'cpp':
      case 'c++':
      case 'c':
        return 'cpp';
      default:
        return l;
    }
  }

  private applyFilters(results: SearchResult[], options?: SearchOptions, queryText?: string): SearchResult[] {
    if (!options) return results;
    let filtered = results;

    if (options.pathFilter) {
      const pf = options.pathFilter.toLowerCase().replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/$/, '');
      if (pf) {
        filtered = filtered.filter((r) => r.filePath.toLowerCase().includes(pf));
      }
    }

    if (options.language) {
      const targetLang = this.normalizeLanguage(options.language);
      filtered = filtered.filter((r) => this.normalizeLanguage(r.language || '') === targetLang);
    }

    if (options.codeOnly) {
      filtered = filtered.filter(
        (r) => r.language !== 'markdown' && !r.filePath.endsWith('.md') && !r.filePath.endsWith('.mdx')
      );
    }

    // Result Diversity: limit max chunks per file (default: 1 chunk per file for focused results, max 2 if limit > 5)
    // And balance Documentation vs Code: max 2 docs in top 10 unless specifically querying markdown
    const limit = options.limit ?? 10;
    const maxPerFile = limit <= 5 ? 1 : 2;
    const isExplicitDocQuery =
      options.pathFilter?.includes('.md') ||
      options.language === 'markdown' ||
      /\b(docs|doc|adr|rfc|skills|readme|guide)\b/i.test(queryText || '');

    const maxDocs = isExplicitDocQuery ? limit : Math.max(2, Math.floor(limit * 0.25));
    let docCount = 0;

    const fileChunkCounts = new Map<string, number>();
    const diverse: SearchResult[] = [];

    for (const res of filtered) {
      const isDoc = res.language === 'markdown' || res.filePath.endsWith('.md') || res.filePath.endsWith('.mdx');
      if (isDoc && !isExplicitDocQuery && docCount >= maxDocs) {
        continue; // Cap documentation to avoid burying code
      }

      const count = fileChunkCounts.get(res.filePath) || 0;
      if (count < maxPerFile) {
        fileChunkCounts.set(res.filePath, count + 1);
        if (isDoc) docCount++;
        diverse.push(res);
      }
    }

    return diverse;
  }

  public async search(
    queryVector: number[],
    options?: number | SearchOptions,
    queryText?: string
  ): Promise<SearchResult[]> {
    const opts: SearchOptions = typeof options === 'number' ? { limit: options } : (options || {});
    const limit = opts.limit ?? 10;
    const fetchLimit = (opts.pathFilter || opts.language || opts.codeOnly) ? Math.max(limit * 10, 100) : Math.max(limit * 3, 30);

    let rawResults: SearchResult[];
    if (queryText) {
      rawResults = await this.searchHybrid(queryVector, queryText, fetchLimit);
    } else {
      rawResults = await this.searchVector(queryVector, fetchLimit);
    }

    return this.applyFilters(rawResults, opts, queryText).slice(0, limit);
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
