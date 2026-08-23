import { describe, it, expect } from 'vitest';
import { QueryEnhancer, stemToken, levenshteinDistance } from '../src/indexer/query-enhancer.js';

describe('Query Enhancer - Stemming & Typo Correction', () => {
  it('should stem plurals, tenses, and common suffixes correctly', () => {
    expect(stemToken('marks')).toBe('mark');
    expect(stemToken('markers')).toBe('mark');
    expect(stemToken('calculating')).toBe('calculat');
    expect(stemToken('validations')).toBe('valida');
    expect(stemToken('listeners')).toBe('listen');
    expect(stemToken('payments')).toBe('payment');
  });

  it('should calculate Levenshtein distance accurately', () => {
    expect(levenshteinDistance('margin', 'mrgin')).toBe(1);
    expect(levenshteinDistance('calculate', 'calcualte')).toBe(2);
    expect(levenshteinDistance('payment', 'paymnet')).toBe(2);
    expect(levenshteinDistance('identical', 'identical')).toBe(0);
  });

  it('should correct typos against repository vocabulary', () => {
    const enhancer = new QueryEnhancer();
    enhancer.addWords('MarginReductionCfdEngine calculateBuySellRequiredMargin PaymentProcessor AuthService');

    // Exact matches should not need correction
    expect(enhancer.correctTypo('AuthService')).toBeNull();

    // Typos should be corrected
    expect(enhancer.correctTypo('mrgin')).toBe('Margin');
    expect(enhancer.correctTypo('paymnet')).toBe('Payment');
  });

  it('should enhance query tokens with both corrections and stems', () => {
    const enhancer = new QueryEnhancer();
    enhancer.addWords('calculateMarkerPosition CIQ Marker');

    const result = enhancer.enhanceTokens(['marks', 'positioning']);
    expect(result.stemmed).toContain('mark');
    expect(result.stemmed).toContain('position');
  });
});
