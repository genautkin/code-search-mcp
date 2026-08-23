/**
 * Fast local Query Enhancer:
 * 1. Stemming / Suffix stripping (plurals, tenses: marks -> mark, calculating -> calculate)
 * 2. In-Memory Project Vocabulary with Levenshtein typo correction (< 1ms)
 */

export function stemToken(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('tions') && w.length > 6) return w.slice(0, -5);
  if (w.endsWith('tion') && w.length > 5) return w.slice(0, -4);
  if (w.endsWith('ers') && w.length > 4) return w.slice(0, -3);
  if (w.endsWith('er') && w.length > 3) return w.slice(0, -2);
  if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  return w;
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 999;

  const la = a.length;
  const lb = b.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= la; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lb; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[la][lb];
}

export class QueryEnhancer {
  private vocabulary: Set<string> = new Set();
  private lowerToWord: Map<string, string> = new Map();

  public addWords(text: string): void {
    const rawTokens = text.split(/[^a-zA-Z0-9_$]+/);
    for (const t of rawTokens) {
      if (t.length >= 3 && t.length <= 40) {
        this.addSingleWord(t);

        // Split CamelCase
        const camelParts = t.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
        if (camelParts.length > 1) {
          for (const p of camelParts) {
            if (p.length >= 3) this.addSingleWord(p);
          }
        }
      }
    }
  }

  private addSingleWord(word: string): void {
    this.vocabulary.add(word);
    const lower = word.toLowerCase();
    if (!this.lowerToWord.has(lower)) {
      this.lowerToWord.set(lower, word);
    }
  }

  public getVocabularySize(): number {
    return this.vocabulary.size;
  }

  /**
   * Find typo correction for a token if not exact match.
   * Returns corrected string or null if no close match found.
   */
  public correctTypo(token: string): string | null {
    const lower = token.toLowerCase();
    if (this.lowerToWord.has(lower)) {
      return null; // Already a valid word in vocabulary
    }

    if (token.length < 4) {
      return null;
    }

    const maxDistance = token.length <= 5 ? 1 : 2;
    let bestMatch: string | null = null;
    let bestDist = maxDistance + 1;

    for (const vocabLower of this.lowerToWord.keys()) {
      // Quick length filter
      if (Math.abs(vocabLower.length - lower.length) > maxDistance) continue;
      // First character heuristic for speed
      if (vocabLower[0] !== lower[0] && maxDistance === 1) continue;

      const dist = levenshteinDistance(lower, vocabLower);
      if (dist <= maxDistance && dist < bestDist) {
        bestDist = dist;
        bestMatch = this.lowerToWord.get(vocabLower) || vocabLower;
        if (dist === 1) break; // Good enough
      }
    }

    return bestMatch;
  }

  public enhanceTokens(rawTokens: string[]): {
    tokens: string[];
    corrections: Map<string, string>;
    stemmed: string[];
  } {
    const tokens: Set<string> = new Set();
    const corrections: Map<string, string> = new Map();
    const stemmed: Set<string> = new Set();

    for (const raw of rawTokens) {
      tokens.add(raw);

      // Check for typo correction
      const corrected = this.correctTypo(raw);
      if (corrected && corrected.toLowerCase() !== raw.toLowerCase()) {
        corrections.set(raw, corrected);
        tokens.add(corrected);
      }

      // Check stemming
      const stem = stemToken(raw);
      if (stem && stem !== raw.toLowerCase()) {
        stemmed.add(stem);
      }
    }

    return {
      tokens: Array.from(tokens),
      corrections,
      stemmed: Array.from(stemmed)
    };
  }
}
