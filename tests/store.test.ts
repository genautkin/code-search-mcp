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
});
