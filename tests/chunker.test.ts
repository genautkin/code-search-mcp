import { describe, it, expect } from 'vitest';
import { chunkCodeFile } from '../src/indexer/chunker.js';

describe('Smart Code Chunker', () => {
  it('should create a single chunk for short files', () => {
    const code = `export function add(a: number, b: number): number {\n  return a + b;\n}\n`;
    const chunks = chunkCodeFile('src/math.ts', '/repo/src/math.ts', code);
    
    expect(chunks.length).toBe(1);
    expect(chunks[0].filePath).toBe('src/math.ts');
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(3);
    expect(chunks[0].content).toContain('export function add');
    expect(chunks[0].contentHash).toBeDefined();
  });

  it('should split larger files into overlapping chunks with accurate line numbers', () => {
    const lines: string[] = [];
    for (let i = 1; i <= 120; i++) {
      lines.push(`const variable_${i} = ${i}; // line ${i}`);
    }
    const code = lines.join('\n');
    const chunks = chunkCodeFile('src/large.ts', '/repo/src/large.ts', code, {
      maxLinesPerChunk: 40,
      overlapLines: 10
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(40);
    // Overlap should cause chunk 1 to start around line 31
    expect(chunks[1].startLine).toBe(31);
    expect(chunks[1].endLine).toBe(70);
  });

  it('should normalize file paths to forward slashes across platforms', () => {
    const code = `console.log("hello");`;
    const chunks = chunkCodeFile('src\\windows\\path.ts', 'C:\\repo\\src\\windows\\path.ts', code);
    expect(chunks[0].filePath).toBe('src/windows/path.ts');
  });
});
