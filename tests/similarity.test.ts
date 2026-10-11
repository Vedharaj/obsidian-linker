import { describe, it, expect } from "vitest";
import { CosineSimilarity } from "../src/relationships/cosine-similarity";
import { KeywordOverlap } from "../src/relationships/keyword-overlap";
import { InvertedIndex } from "../src/indexing/inverted-index";
import { RelationshipScorer } from "../src/relationships/relationship-scorer";
import { LinkAnalyzer } from "../src/relationships/link-analyzer";
import { NoteRecord } from "../src/types";

describe("Similarity Engine and Scoring", () => {
  it("computes cosine similarity correctly (1 for identical, 0 for orthogonal)", () => {
    // Two identical normalized vectors
    const vecA = new Map([
      ["ai", 0.6],
      ["robotics", 0.8],
    ]);
    const vecB = new Map([
      ["ai", 0.6],
      ["robotics", 0.8],
    ]);

    expect(CosineSimilarity.calculate(vecA, vecB)).toBe(1.0);

    // Two disjoint / orthogonal vectors
    const vecC = new Map([
      ["gardening", 0.7071],
      ["plants", 0.7071],
    ]);

    expect(CosineSimilarity.calculate(vecA, vecC)).toBe(0);
  });

  it("is symmetric: sim(A, B) === sim(B, A)", () => {
    const vecA = new Map([
      ["term1", 0.5],
      ["term2", 0.866],
    ]);
    const vecB = new Map([
      ["term1", 0.7071],
      ["term3", 0.7071],
    ]);

    const simAB = CosineSimilarity.calculate(vecA, vecB);
    const simBA = CosineSimilarity.calculate(vecB, vecA);
    expect(simAB).toBe(simBA);
    expect(simAB).toBeGreaterThan(0);
  });

  it("handles empty or zero-magnitude vectors safely without NaN or infinity", () => {
    const emptyVec = new Map<string, number>();
    const vecA = new Map([["test", 1.0]]);

    expect(CosineSimilarity.calculate(emptyVec, vecA)).toBe(0);
    expect(CosineSimilarity.calculate(emptyVec, emptyVec)).toBe(0);
  });

  it("calculates keyword overlap and extracts shared terms", () => {
    const termsA = new Set(["machine", "learning", "python", "pytorch"]);
    const termsB = new Set(["machine", "learning", "javascript", "tensorflow"]);

    const overlap = KeywordOverlap.calculateOverlap(termsA, termsB);
    expect(overlap.score).toBe(0.5); // 2 shared out of min(4, 4)
    expect(overlap.sharedTerms).toContain("machine");
    expect(overlap.sharedTerms).toContain("learning");
  });

  it("combines multi-factor evidence and prevents self-similarity proposals", () => {
    const linkAnalyzer = new LinkAnalyzer();
    const scorer = new RelationshipScorer(
      { tfidf: 0.5, keyword: 0.2, link: 0.2, heading: 0.1 },
      linkAnalyzer
    );

    const noteA: NoteRecord = {
      id: "Notes/Deep Learning.md",
      path: "Notes/Deep Learning.md",
      title: "Deep Learning",
      aliases: ["DL"],
      contentHash: "hashA",
      wordCount: 150,
      indexedAt: Date.now(),
      status: "indexed",
      headings: ["Introduction", "Neural Networks Architecture"],
    };

    const noteB: NoteRecord = {
      id: "Notes/Neural Networks.md",
      path: "Notes/Neural Networks.md",
      title: "Neural Networks",
      aliases: ["NN"],
      contentHash: "hashB",
      wordCount: 200,
      indexedAt: Date.now(),
      status: "indexed",
      headings: ["Foundations", "Backpropagation"],
    };

    const vecA = new Map([
      ["neural", 0.7071],
      ["networks", 0.7071],
    ]);
    const vecB = new Map([
      ["neural", 0.7071],
      ["networks", 0.7071],
    ]);
    const termsA = new Set(["neural", "networks", "deep"]);
    const termsB = new Set(["neural", "networks", "layers"]);

    const rel = scorer.scorePair(noteA, vecA, termsA, noteB, vecB, termsB);

    expect(rel.score).toBeGreaterThan(0.6);
    expect(rel.evidence.length).toBeGreaterThan(0);
    // Heading match: noteB's title "Neural Networks" appears in noteA's heading
    expect(rel.evidence.some((e) => e.includes("corresponds directly to heading"))).toBe(true);
    // Canonical ordering: sourceId < targetId
    expect(rel.sourceId < rel.targetId).toBe(true);
  });
});
