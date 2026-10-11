import { describe, it, expect } from "vitest";
import { TfIdfEngine } from "../src/indexing/tfidf";
import { InvertedIndex } from "../src/indexing/inverted-index";

describe("TF-IDF Engine", () => {
  it("calculates smoothed IDF according to the exact mathematical formula", () => {
    // Formula: ln((N + 1) / (DF + 1)) + 1
    const totalDocs = 10;
    const docFreq = 2;
    const expectedIdf = Math.log((10 + 1) / (2 + 1)) + 1;

    const computedIdf = TfIdfEngine.calculateIdf(totalDocs, docFreq);
    expect(computedIdf).toBeCloseTo(expectedIdf, 5);
  });

  it("calculates normalized term frequency", () => {
    // Formula: f(t, d) / max(1, terms(d))
    expect(TfIdfEngine.calculateTf(5, 20)).toBe(0.25);
    expect(TfIdfEngine.calculateTf(0, 10)).toBe(0);
    expect(TfIdfEngine.calculateTf(3, 0)).toBe(3);
  });

  it("generates an L2-normalized vector with unit length", () => {
    const invIndex = new InvertedIndex();
    const doc1Freqs = new Map([
      ["quantum", 4],
      ["physics", 2],
    ]);
    const doc2Freqs = new Map([
      ["quantum", 1],
      ["computing", 3],
    ]);

    invIndex.addNote("doc1", doc1Freqs);
    invIndex.addNote("doc2", doc2Freqs);

    const vec = TfIdfEngine.computeVector(doc1Freqs, 6, invIndex);

    let sumSquares = 0;
    for (const weight of vec.values()) {
      sumSquares += weight * weight;
    }

    // Vector magnitude must be exactly 1.0 (L2 unit vector)
    expect(Math.sqrt(sumSquares)).toBeCloseTo(1.0, 5);
  });

  it("handles empty document frequencies safely", () => {
    const invIndex = new InvertedIndex();
    const emptyFreqs = new Map<string, number>();

    const vec = TfIdfEngine.computeVector(emptyFreqs, 0, invIndex);
    expect(vec.size).toBe(0);
  });
});
