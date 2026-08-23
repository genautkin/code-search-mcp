import { describe, it, expect } from 'vitest';
import { EmbeddingEngine } from '../src/embeddings/engine.js';

describe('Local Embedding Engine', () => {
  it('should generate normalized 384-dimensional embeddings locally', async () => {
    const engine = EmbeddingEngine.getInstance('Xenova/all-MiniLM-L6-v2');
    const embedding = await engine.embedText('function calculateTax(subtotal: number) { return subtotal * 0.2; }');

    expect(embedding).toBeDefined();
    expect(embedding.length).toBe(384);
    
    // Check vector is normalized (magnitude close to 1.0)
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    expect(norm).toBeGreaterThan(0.95);
    expect(norm).toBeLessThan(1.05);
  }, 60000);

  it('should generate embeddings in batches', async () => {
    const engine = EmbeddingEngine.getInstance();
    const texts = [
      'import { ref } from "vue";',
      'class DatabaseConnection { connect() {} }'
    ];
    const results = await engine.embedBatch(texts);
    expect(results.length).toBe(2);
    expect(results[0].length).toBe(384);
    expect(results[1].length).toBe(384);
  }, 60000);
});
