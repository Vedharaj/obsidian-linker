export class KeywordOverlap {
  /**
   * Calculates keyword overlap ratio between two sets of terms.
   * Uses overlap coefficient: |A ∩ B| / min(|A|, |B|).
   */
  public static calculateOverlap(
    termsA: Set<string>,
    termsB: Set<string>
  ): { score: number; sharedTerms: string[] } {
    if (!termsA || !termsB || termsA.size === 0 || termsB.size === 0) {
      return { score: 0, sharedTerms: [] };
    }

    const [smaller, larger] = termsA.size <= termsB.size ? [termsA, termsB] : [termsB, termsA];
    const sharedTerms: string[] = [];

    for (const term of smaller) {
      if (larger.has(term)) {
        sharedTerms.push(term);
      }
    }

    const minSize = Math.min(termsA.size, termsB.size);
    const score = minSize > 0 ? sharedTerms.length / minSize : 0;

    return {
      score: Math.min(1, Math.round(score * 10000) / 10000),
      sharedTerms,
    };
  }
}
