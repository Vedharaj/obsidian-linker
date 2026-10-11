import { SparseVector } from "../indexing/tfidf";

export class CosineSimilarity {
  /**
   * Calculates cosine similarity between two sparse TF-IDF vectors.
   * Assumes vectors are L2-normalized, calculating dot product over intersection.
   */
  public static calculate(vecA: SparseVector, vecB: SparseVector): number {
    if (!vecA || !vecB || vecA.size === 0 || vecB.size === 0) {
      return 0;
    }

    // Iterate over the smaller vector for maximum efficiency
    const [smaller, larger] = vecA.size <= vecB.size ? [vecA, vecB] : [vecB, vecA];

    let dotProduct = 0;
    for (const [term, weightA] of smaller.entries()) {
      const weightB = larger.get(term);
      if (weightB !== undefined) {
        dotProduct += weightA * weightB;
      }
    }

    // Clamp score to [0, 1] and guard against floating precision artifacts
    if (dotProduct <= 0 || !Number.isFinite(dotProduct)) return 0;
    if (dotProduct >= 1) return 1;

    return Math.round(dotProduct * 10000) / 10000;
  }
}
