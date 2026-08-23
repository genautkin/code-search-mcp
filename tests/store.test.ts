import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { VectorStore } from '../src/store/lancedb.js';
import { CodeChunk } from '../src/types.js';

describe('LanceDB Vector Store', () => {
  let tempDir: string;
  let store: VectorStore;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lancedb-test-'));
    store = new VectorStore(tempDir);
    await store.init();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should insert chunks and search by vector similarity', async () => {
    const dummyVector1 = new Array(384).fill(0.1);
    const dummyVector2 = new Array(384).fill(0.9);

    const chunk1: CodeChunk = {
      id: 'src/math.ts:1:10',
      filePath: 'src/math.ts',
      absolutePath: '/repo/src/math.ts',
      startLine: 1,
      endLine: 10,
      content: 'export function add(a, b) { return a + b; }',
      contentHash: 'hash1',
      vector: dummyVector1,
      language: 'typescript',
      updatedAt: Date.now()
    };

    const chunk2: CodeChunk = {
      id: 'src/auth.ts:1:10',
      filePath: 'src/auth.ts',
      absolutePath: '/repo/src/auth.ts',
      startLine: 1,
      endLine: 10,
      content: 'export function login(user, pass) {}',
      contentHash: 'hash2',
      vector: dummyVector2,
      language: 'typescript',
      updatedAt: Date.now()
    };

    await store.insertChunks([chunk1, chunk2]);

    const count = await store.count();
    expect(count).toBe(2);

    // Search for something close to vector 1
    const results = await store.search(dummyVector1, 5);
    expect(results.length).toBe(2);
    expect(results[0].filePath).toBe('src/math.ts');
  });

  it('should delete chunks by filePath when a file is modified or removed', async () => {
    const dummyVector = new Array(384).fill(0.5);
    const chunk: CodeChunk = {
      id: 'src/to-delete.ts:1:5',
      filePath: 'src/to-delete.ts',
      absolutePath: '/repo/src/to-delete.ts',
      startLine: 1,
      endLine: 5,
      content: 'delete me',
      contentHash: 'hash_del',
      vector: dummyVector,
      language: 'typescript',
      updatedAt: Date.now()
    };

    await store.insertChunks([chunk]);
    expect(await store.count()).toBe(1);

    await store.deleteByFilePath('src/to-delete.ts');
    expect(await store.count()).toBe(0);
  });

  it('should perform lexical search and hybrid fusion for exact code identifiers', async () => {
    const vectorA = new Array(384).fill(0.2);
    const vectorB = new Array(384).fill(0.8);

    const chunkA: CodeChunk = {
      id: 'src/ciq/marker.js:105:150',
      filePath: 'src/ciq/marker.js',
      absolutePath: '/repo/src/ciq/marker.js',
      startLine: 105,
      endLine: 150,
      content: 'CIQ.Marker = function(params) { this.xPositioner = params.xPositioner; };',
      contentHash: 'hash_marker',
      vector: vectorA,
      language: 'javascript',
      updatedAt: Date.now()
    };

    const chunkB: CodeChunk = {
      id: 'src/general/helper.js:1:20',
      filePath: 'src/general/helper.js',
      absolutePath: '/repo/src/general/helper.js',
      startLine: 1,
      endLine: 20,
      content: 'function formatGeneralText() { return true; }',
      contentHash: 'hash_gen',
      vector: vectorB,
      language: 'javascript',
      updatedAt: Date.now()
    };

    await store.insertChunks([chunkA, chunkB]);

    // Exact lexical search
    const lexicalHits = await store.searchLexical('CIQ.Marker', 5);
    expect(lexicalHits.length).toBeGreaterThan(0);
    expect(lexicalHits[0].filePath).toBe('src/ciq/marker.js');

    // Hybrid search fusing query text + vector
    const hybridHits = await store.search(vectorB, 5, 'CIQ.Marker xPositioner');
    expect(hybridHits.length).toBeGreaterThan(0);
    expect(hybridHits[0].filePath).toBe('src/ciq/marker.js');
  });
});
