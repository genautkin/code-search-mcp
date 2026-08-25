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

    // Base SQL filter on primary tokens and stemmed tokens
    const primaryTokens = Array.from(new Set([...rawTokens, ...enhanced.tokens])).slice(0, 5);
    const searchTokens = Array.from(tokenSet).slice(0, 10);
    const filterClauses = searchTokens.map((token) => {
      const escaped = token.replace(/'/g, "''").replace(/\\/g, '\\\\').toLowerCase();
      return `LOWER(\`content\`) LIKE '%${escaped}%' OR LOWER(\`filePath\`) LIKE '%${escaped}%'`;
    });

    const isJsonQuery = queryText.toLowerCase().includes('json');

    try {
      const whereClause = filterClauses.join(' OR ');
      const records = await table.query().where(whereClause).limit(limit).toArray();

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

          let score = Math.min(1, matchCount * 0.1);
          // De-prioritize raw static JSON dictionary files when searching code/concepts
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

    if (lexicalHits.length === 0) {
      return vectorHits.slice(0, limit);
    }

    if (vectorHits.length === 0) {
      return lexicalHits.slice(0, limit);
    }

    const rrfMap = new Map<string, { result: SearchResult; rrfScore: number; vectorScore: number }>();
    const RRF_K = 60;
    const isJsonQuery = queryText.toLowerCase().includes('json');

    for (let i = 0; i < vectorHits.length; i++) {
      const hit = vectorHits[i];
      const key = `${hit.filePath}:${hit.startLine}:${hit.endLine}`;
      let rrf = 1.0 / (RRF_K + (i + 1));
      if (!isJsonQuery && (hit.filePath.endsWith('.json') || hit.language === 'json')) {
        rrf *= 0.6;
      }
      rrfMap.set(key, {
        result: hit,
        rrfScore: rrf,
        vectorScore: hit.score
      });
    }

    for (let j = 0; j < lexicalHits.length; j++) {
      const hit = lexicalHits[j];
      const key = `${hit.filePath}:${hit.startLine}:${hit.endLine}`;
      let rrf = 1.2 / (RRF_K + (j + 1));
      if (!isJsonQuery && (hit.filePath.endsWith('.json') || hit.language === 'json')) {
        rrf *= 0.6;
      }
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
      .slice(0, candidateLimit);

    if (fused.length === 0) return [];

    // Detect code intent from query (e.g. "find the code", camelCase tokens like isKo, function keywords)
    const hasCodeIntent =
      /\b(code|func|function|class|interface|type|const|method|handler|builder|component|is[A-Z]|get[A-Z]|set[A-Z]|has[A-Z])\b/i.test(
        queryText
      ) || /[a-z][A-Z]/.test(queryText);

    const maxRrf = fused[0].rrfScore;
    return fused.map(({ result, rrfScore, vectorScore }) => {
      let blendedScore = Math.max(vectorScore, Math.min(0.95, (rrfScore / maxRrf) * 0.85));
      const isCodeFile = result.language !== 'markdown' && !result.filePath.endsWith('.md') && !result.filePath.endsWith('.mdx');

      // Boost code files when query has code intent
      if (hasCodeIntent && isCodeFile) {
        blendedScore = Math.min(0.99, blendedScore * 1.15);
      }

      return {
        ...result,
        score: Number(blendedScore.toFixed(4))
      };
    }).sort((a, b) => b.score - a.score);
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
