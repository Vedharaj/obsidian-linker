import { InvertedIndex } from "./inverted-index";

export type SparseVector = Map<string, number>;

export class TfIdfEngine {
  /**
   * Calculates smoothed Inverse Document Frequency (IDF).
   * IDF(t) = ln((N + 1) / (DF(t) + 1)) + 1
   */
  public static calculateIdf(totalDocuments: number, documentFrequency: number): number {
    if (totalDocuments <= 0) return 1;
    return Math.log((totalDocuments + 1) / (documentFrequency + 1)) + 1;
  }

  /**
   * Calculates Term Frequency (TF).
   * TF(t, d) = f(t, d) / max(1, totalTerms(d))
   */
  public static calculateTf(termFrequency: number, totalTermsInDoc: number): number {
    return termFrequency / Math.max(1, totalTermsInDoc);
  }

  /**
   * Generates a sparse normalized TF-IDF vector for a document.
   */
  public static computeVector(
    frequencies: Map<string, number>,
    totalTermsInDoc: number,
    invertedIndex: InvertedIndex
  ): SparseVector {
    const rawVector: SparseVector = new Map();
    const totalDocs = invertedIndex.size;

    let sumSquares = 0;

    for (const [term, count] of frequencies.entries()) {
      const tf = this.calculateTf(count, totalTermsInDoc);
      const df = invertedIndex.getDocumentFrequency(term);
      const idf = this.calculateIdf(totalDocs, df);
      const weight = tf * idf;

      if (weight > 0) {
        rawVector.set(term, weight);
        sumSquares += weight * weight;
      }
    }

    // L2 Normalize
    const magnitude = Math.sqrt(sumSquares);
    if (magnitude === 0) {
      return rawVector;
    }

    const normalizedVector: SparseVector = new Map();
    for (const [term, weight] of rawVector.entries()) {
      normalizedVector.set(term, weight / magnitude);
    }

    return normalizedVector;
  }
}
