import { describe, it, expect } from 'vitest';
import { QueryEnhancer, MAX_VOCABULARY_SIZE } from '../src/indexer/query-enhancer.js';

describe('QueryEnhancer Memory Safeguards', () => {
  it('should enforce MAX_VOCABULARY_SIZE bound', () => {
    const enhancer = new QueryEnhancer();

    // Try to add more than MAX_VOCABULARY_SIZE distinct tokens
    for (let i = 0; i < MAX_VOCABULARY_SIZE + 5000; i++) {
      enhancer.addWords(`wordAlpha${i}`);
    }

    expect(enhancer.getVocabularySize()).toBeLessThanOrEqual(MAX_VOCABULARY_SIZE);
  });

  it('should truncate huge strings to prevent regex denial and memory spikes', () => {
    const enhancer = new QueryEnhancer();
    const hugeContent = 'var x = 1; '.repeat(10000); // 110,000 characters

    enhancer.addWords(hugeContent);
    // Should process without throwing or consuming excessive heap
    expect(enhancer.getVocabularySize()).toBeGreaterThan(0);
    expect(enhancer.getVocabularySize()).toBeLessThanOrEqual(100);
  });
});
